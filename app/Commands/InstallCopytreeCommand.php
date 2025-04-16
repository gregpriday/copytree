<?php

namespace App\Commands;

use App\Facades\AI;
use App\Services\ConversationStateService;
use Illuminate\Support\Facades\File;
use LaravelZero\Framework\Commands\Command;

class InstallCopytreeCommand extends Command
{
    /**
     * The signature of the command.
     *
     * @var string
     */
    protected $signature = 'install:copytree';

    /**
     * The description of the command.
     *
     * @var string
     */
    protected $description = 'Sets up the Copytree environment, including directory creation and AI API configuration';

    /**
     * List of available AI models for different tasks
     */
    protected array $availableModels = [
        'ask' => [
            'accounts/fireworks/models/llama4-maverick-instruct-basic' => 'LLaMa 4 Maverick - Latest model for complex reasoning',
            'accounts/fireworks/models/mixtral-8x7b-instruct' => 'Mixtral 8x7B - Powerful model with excellent reasoning',
        ],
        'summarization' => [
            'accounts/fireworks/models/llama3-8b-instruct' => 'LLaMa 3 8B - Most cost-effective for summarization',
            'accounts/fireworks/models/llama4-maverick-instruct-basic' => 'LLaMa 4 Maverick - Balanced efficiency and quality',
        ],
        'classification' => [
            'accounts/fireworks/models/llama4-maverick-instruct-basic' => 'LLaMa 4 Maverick - Balanced performance for classification/filtering',
            'accounts/fireworks/models/llama3-8b-instruct' => 'LLaMa 3 8B - Cost-effective for simple classification',
        ],
        'general' => [
            'accounts/fireworks/models/llama4-maverick-instruct-basic' => 'LLaMa 4 Maverick - Balanced model for general tasks',
            'accounts/fireworks/models/llama3-8b-instruct' => 'LLaMa 3 8B - Cost-effective for general tasks',
        ],
    ];

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $this->info('Welcome to Copytree installation!');
        $this->line('This will set up the necessary directories and configuration for Copytree.');

        // Step 1: Create the ~/.copytree directory
        $copyTreeDir = copytree_path();
        if (! is_dir($copyTreeDir)) {
            $this->line('Creating Copytree directory at: '.$copyTreeDir);
            if (! mkdir($copyTreeDir, 0755, true) && ! is_dir($copyTreeDir)) {
                $this->error('Failed to create the Copytree directory.');

                return self::FAILURE;
            }
            $this->info('✓ Copytree directory created successfully.');
        } else {
            $this->info('✓ Copytree directory already exists.');
        }

        // Create subdirectories if they don't exist
        $subdirs = ['cache', 'outputs', 'repos'];
        foreach ($subdirs as $subdir) {
            $path = copytree_path($subdir);
            if (! is_dir($path)) {
                if (! mkdir($path, 0755, true) && ! is_dir($path)) {
                    $this->error("Failed to create the {$subdir} directory.");

                    return self::FAILURE;
                }
                $this->info("✓ Created {$subdir} directory.");
            }
        }

        // Step 2: Check for existing .env file
        $envPath = $copyTreeDir.'/.env';
        $envExists = file_exists($envPath);
        $envContent = $envExists ? file_get_contents($envPath) : '';

        // Step 3: Collect configuration values
        $configValues = $this->collectConfigValues($envContent);

        // Step 4: Save the configuration to .env file
        $this->saveConfigToEnv($envPath, $envContent, $configValues);

        // Step 5: Test the AI API key
        if (! empty($configValues['FIREWORKS_API_KEY'])) {
            if ($this->testAIApiKey($configValues['FIREWORKS_API_KEY'])) {
                $this->info('✓ AI API key is valid!');
            } else {
                $this->error('Invalid API key. AI features will not be available.');

                return self::FAILURE;
            }
        }

        // Step 6: Set up the database for conversation history
        $this->setupDatabase();

        $this->info('🎉 Copytree installation completed successfully!');

        return self::SUCCESS;
    }

    /**
     * Collect configuration values from the user, pre-populated with existing values.
     */
    protected function collectConfigValues(string $envContent): array
    {
        $configValues = [];

        // Extract existing values from env content if available
        $extractValue = function ($key, $default = '') use ($envContent) {
            preg_match("/{$key}=([^\s]+)/", $envContent, $matches);

            return isset($matches[1]) && ! empty($matches[1]) ? $matches[1] : $default;
        };

        // Step 1: Collect Fireworks API Key
        $existingKey = $extractValue('FIREWORKS_API_KEY');
        if (! empty($existingKey)) {
            $this->info('Found existing AI API key: '.$this->maskApiKey($existingKey));
            if ($this->confirm('Do you want to use this existing API key?', true)) {
                $configValues['FIREWORKS_API_KEY'] = $existingKey;
            } else {
                $configValues['FIREWORKS_API_KEY'] = $this->promptForApiKey();
            }
        } else {
            $this->line('');
            $this->line('An API key is required for AI features.');
            $this->line('You can get one from: https://fireworks.ai/');
            $this->line('');
            $configValues['FIREWORKS_API_KEY'] = $this->promptForApiKey();
        }

        $this->line('');
        $this->info('Configure AI models for specific tasks:');
        $this->line('Different tasks in Copytree can use different AI models optimized for their needs.');

        // Step 2: Model for Copytree Ask functionality
        $this->line('');
        $this->info('1. Copytree Ask Model');
        $this->line('This model is used for the primary "copytree ask" command to answer complex questions about codebases.');
        $existingAskModel = $extractValue('FIREWORKS_ASK_MODEL', 'accounts/fireworks/models/llama4-maverick-instruct-basic');
        $configValues['FIREWORKS_ASK_MODEL'] = $this->selectModelFromOptions('ask', $existingAskModel);

        // Step 4: Model for summarization tasks
        $this->line('');
        $this->info('2. Summarization Model');
        $this->line('This model is used for summarizing text, code, and other content. A cost-effective model is recommended.');
        $existingSummarizationModel = $extractValue('FIREWORKS_SUMMARIZATION_MODEL', 'accounts/fireworks/models/llama3-8b-instruct');
        $configValues['FIREWORKS_SUMMARIZATION_MODEL'] = $this->selectModelFromOptions('summarization', $existingSummarizationModel);

        // Step 5: Model for classification tasks
        $this->line('');
        $this->info('3. Classification Model');
        $this->line('This model is used for filtering files, classifying content, and other decision-making tasks.');
        $existingClassificationModel = $extractValue('FIREWORKS_CLASSIFICATION_MODEL', 'accounts/fireworks/models/llama4-maverick-instruct-basic');
        $configValues['FIREWORKS_CLASSIFICATION_MODEL'] = $this->selectModelFromOptions('classification', $existingClassificationModel);

        // Step 6: Default general-purpose model
        $this->line('');
        $this->info('4. General Purpose Model');
        $this->line('This model is used as a fallback for any tasks not covered by the specific models above.');
        $existingGeneralModel = $extractValue('FIREWORKS_GENERAL_MODEL', 'accounts/fireworks/models/llama4-maverick-instruct-basic');
        $configValues['FIREWORKS_GENERAL_MODEL'] = $this->selectModelFromOptions('general', $existingGeneralModel);

        // Step 7: Request timeout
        $this->line('');
        $existingTimeout = $extractValue('FIREWORKS_REQUEST_TIMEOUT', '120');
        $configValues['FIREWORKS_REQUEST_TIMEOUT'] = $this->ask('Enter request timeout in seconds (default: 120)', $existingTimeout);

        // Step 8: History limit
        $this->line('');
        $existingHistoryLimit = $extractValue('COPYTREE_HISTORY_LIMIT', '20');
        $configValues['COPYTREE_HISTORY_LIMIT'] = $this->ask('Enter maximum number of conversation history items to store (default: 20)', $existingHistoryLimit);

        // Step 9: Garbage collection days
        $this->line('');
        $existingGcDays = $extractValue('COPYTREE_GC_DAYS', '7');
        $configValues['COPYTREE_GC_DAYS'] = $this->ask('Enter number of days to keep conversation history before automatic cleanup (default: 7)', $existingGcDays);

        return $configValues;
    }

    /**
     * Present the user with model options and return their selection.
     */
    protected function selectModelFromOptions(string $taskType, string $defaultModel): string
    {
        $options = $this->availableModels[$taskType];
        $modelNames = array_keys($options);

        // Check if the default model exists in our options
        $customModel = false;
        if (! in_array($defaultModel, $modelNames)) {
            $customModel = true;
            // Add the currently set model if it's not in our standard list
            $options[$defaultModel] = "Custom model: {$defaultModel}";
        }

        // Create an array for the choice method with the default option at the top
        $choices = [];

        // Add the default option first with a special label
        if ($customModel) {
            $choices[$defaultModel] = "{$defaultModel} [current custom model]";
        } else {
            $choices[$defaultModel] = "{$defaultModel}: {$options[$defaultModel]} [current]";
        }

        // Add the rest of the options
        foreach ($options as $name => $description) {
            if ($name !== $defaultModel) {
                $choices[$name] = "{$name}: {$description}";
            }
        }

        // Add a custom model option at the end
        $choices['custom'] = 'Enter a custom model name';

        // Convert to indexed array for the choice method
        $indexedChoices = array_values($choices);
        // Default is the first option (index 0)
        $selection = $this->choice('Select a model', $indexedChoices, 0);

        // If they chose "Enter a custom model name", prompt for it
        if ($selection === 'Enter a custom model name') {
            $customModel = $this->ask('Enter custom model name (e.g., accounts/fireworks/models/model-name)');

            return $customModel;
        }

        // Extract the model name (everything before the colon or space)
        preg_match('/^([^:]+)(?:[: ].*)?$/', $selection, $matches);

        return trim($matches[1] ?? $defaultModel);
    }

    /**
     * Mask an API key for display, showing only first and last few characters.
     */
    protected function maskApiKey(string $key): string
    {
        $length = strlen($key);
        if ($length <= 8) {
            return '********'; // Just mask completely if it's very short
        }

        return substr($key, 0, 4).'...'.substr($key, -4);
    }

    /**
     * Prompt the user for a valid API key.
     */
    protected function promptForApiKey(): string
    {
        $key = '';
        while (empty($key)) {
            $key = $this->secret('Enter your AI API key');
            if (empty($key)) {
                $this->warn('API key cannot be empty.');
                if (! $this->confirm('Do you want to enter an API key? AI features will not be available without one.', true)) {
                    $this->warn('Proceeding without an API key. AI features will not be available.');
                    break;
                }
            }
        }

        return $key;
    }

    /**
     * Test the API key for validity.
     */
    protected function testAIApiKey(string $apiKey): bool
    {
        $this->info('Testing API key...');

        try {
            // Use a simple prompt to test the API key
            $response = AI::chat()->create([
                'model' => AI::models()['medium'],
                'messages' => [
                    ['role' => 'user', 'content' => 'Say hello'],
                ],
                'max_tokens' => 10,
            ]);

            return ! empty($response->choices);
        } catch (\Exception $e) {
            $this->error('Error testing API key: '.$e->getMessage());

            return false;
        }
    }

    /**
     * Save configuration values to the .env file.
     */
    protected function saveConfigToEnv(string $envPath, string $envContent, array $configValues): void
    {
        $lines = explode("\n", $envContent);
        $updatedKeys = array_keys($configValues);
        $newLines = [];
        $addedKeys = [];

        // Update existing lines
        foreach ($lines as $line) {
            $trimmedLine = trim($line);
            if (empty($trimmedLine) || strpos($trimmedLine, '=') === false) {
                $newLines[] = $line; // Keep empty lines and comments
                continue;
            }

            list($key) = explode('=', $trimmedLine, 2);
            if (in_array($key, $updatedKeys)) {
                $newLines[] = "{$key}={$configValues[$key]}";
                $addedKeys[] = $key;
            } else {
                $newLines[] = $line; // Keep lines not being updated
            }
        }

        // Add new keys that weren't in the original file
        foreach ($configValues as $key => $value) {
            if (!in_array($key, $addedKeys)) {
                $newLines[] = "{$key}={$value}";
            }
        }

        // Ensure no duplicate empty lines at the end
        while (count($newLines) > 0 && empty(trim(end($newLines)))) {
            array_pop($newLines);
        }

        // Write the updated content back to the file
        if (file_put_contents($envPath, implode("\n", $newLines)."\n") === false) {
            $this->error("Failed to write to {$envPath}");
        } else {
            $this->info("✓ Configuration saved to {$envPath}");
        }
    }

    /**
     * Set up the SQLite database for conversation history.
     */
    protected function setupDatabase(): void
    {
        $dbPath = copytree_path('database.sqlite');
        if (! file_exists($dbPath)) {
            // Touch the database file to create it
            touch($dbPath);
            $this->info('✓ Created conversation history database.');

            // Initialize the database schema
            $this->call('copytree:migrate');

            $this->info('✓ Initialized conversation history database schema.');
        } else {
            $this->info('✓ Conversation history database already exists.');
        }

        // Create a ConversationStateService instance to ensure the table exists
        $conversationService = new ConversationStateService;
        $this->info('✓ Conversation state service initialized.');
    }
}
