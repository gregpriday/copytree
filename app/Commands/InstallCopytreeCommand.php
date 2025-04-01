<?php

namespace App\Commands;

use App\Services\ConversationStateService;
use App\Services\SummarizationService;
use Gemini\Laravel\Facades\Gemini;
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
    protected $description = 'Sets up the Copytree environment, including directory creation and Gemini API key configuration';

    /**
     * List of available Gemini models for different tasks
     */
    protected array $availableModels = [
        'ask' => [
            'gemini-2.5-pro-exp-03-25' => 'Gemini 2.5 Pro - Latest experimental model for complex reasoning (March 2025)',
            'gemini-2.0-pro' => 'Gemini 2.0 Pro - Powerful reasoning with 2M token context window',
            'gemini-1.5-pro' => 'Gemini 1.5 Pro - Legacy model with 2M token context window',
        ],
        'expert_selector' => [
            'models/gemini-2.0-flash' => 'Gemini 2.0 Flash - Fast model for classification tasks',
            'models/gemini-2.0-flash-lite' => 'Gemini 2.0 Flash-Lite - Cost-effective model for simple tasks',
            'models/gemini-1.5-flash' => 'Gemini 1.5 Flash - Legacy fast model for simple tasks',
        ],
        'summarization' => [
            'models/gemini-2.0-flash-lite' => 'Gemini 2.0 Flash-Lite - Most cost-effective for summarization',
            'models/gemini-2.0-flash' => 'Gemini 2.0 Flash - Balanced efficiency and quality',
            'models/gemini-1.5-flash' => 'Gemini 1.5 Flash - Legacy model for summarization',
        ],
        'classification' => [
            'models/gemini-2.0-flash' => 'Gemini 2.0 Flash - Balanced performance for classification/filtering',
            'models/gemini-2.0-flash-lite' => 'Gemini 2.0 Flash-Lite - Cost-effective for simple classification',
            'models/gemini-1.5-flash' => 'Gemini 1.5 Flash - Legacy model for classification',
        ],
        'general' => [
            'models/gemini-2.0-flash' => 'Gemini 2.0 Flash - Balanced model for general tasks',
            'models/gemini-2.0-flash-lite' => 'Gemini 2.0 Flash-Lite - Cost-effective for general tasks',
            'models/gemini-1.5-flash' => 'Gemini 1.5 Flash - Legacy model for general tasks',
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

        // Step 5: Test the Gemini API key
        if (! empty($configValues['GEMINI_API_KEY'])) {
            if ($this->testGeminiApiKey($configValues['GEMINI_API_KEY'])) {
                $this->info('✓ Gemini API key is valid!');
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

        // Step 1: Collect Gemini API Key
        $existingKey = $extractValue('GEMINI_API_KEY');
        if (! empty($existingKey)) {
            $this->info('Found existing Gemini API key: '.$this->maskApiKey($existingKey));
            if ($this->confirm('Do you want to use this existing API key?', true)) {
                $configValues['GEMINI_API_KEY'] = $existingKey;
            } else {
                $configValues['GEMINI_API_KEY'] = $this->promptForApiKey();
            }
        } else {
            $this->line('');
            $this->line('A Gemini API key is required for AI features.');
            $this->line('You can get one from: https://makersuite.google.com');
            $this->line('');
            $configValues['GEMINI_API_KEY'] = $this->promptForApiKey();
        }

        $this->line('');
        $this->info('Configure Gemini models for specific tasks:');
        $this->line('Different tasks in Copytree can use different Gemini models optimized for their needs.');

        // Step 2: Model for Copytree Ask functionality
        $this->line('');
        $this->info('1. Copytree Ask Model');
        $this->line('This model is used for the primary "copytree ask" command to answer complex questions about codebases.');
        $existingAskModel = $extractValue('GEMINI_ASK_MODEL', 'gemini-2.5-pro-exp-03-25');
        $configValues['GEMINI_ASK_MODEL'] = $this->selectModelFromOptions('ask', $existingAskModel);

        // Step 3: Model for expert selection
        $this->line('');
        $this->info('2. Expert Selector Model');
        $this->line('This model selects the appropriate expert system prompt based on the user\'s question.');
        $existingExpertSelectorModel = $extractValue('GEMINI_EXPERT_SELECTOR_MODEL', 'models/gemini-2.0-flash');
        $configValues['GEMINI_EXPERT_SELECTOR_MODEL'] = $this->selectModelFromOptions('expert_selector', $existingExpertSelectorModel);

        // Step 4: Model for summarization tasks
        $this->line('');
        $this->info('3. Summarization Model');
        $this->line('This model is used for summarizing text, code, and other content. A cost-effective model is recommended.');
        $existingSummarizationModel = $extractValue('GEMINI_SUMMARIZATION_MODEL', 'models/gemini-2.0-flash-lite');
        $configValues['GEMINI_SUMMARIZATION_MODEL'] = $this->selectModelFromOptions('summarization', $existingSummarizationModel);

        // Step 5: Model for classification tasks
        $this->line('');
        $this->info('4. Classification Model');
        $this->line('This model is used for filtering files, classifying content, and other decision-making tasks.');
        $existingClassificationModel = $extractValue('GEMINI_CLASSIFICATION_MODEL', 'models/gemini-2.0-flash');
        $configValues['GEMINI_CLASSIFICATION_MODEL'] = $this->selectModelFromOptions('classification', $existingClassificationModel);

        // Step 6: Default general-purpose model
        $this->line('');
        $this->info('5. General Purpose Model');
        $this->line('This model is used as a fallback for any tasks not covered by the specific models above.');
        $existingGeneralModel = $extractValue('GEMINI_GENERAL_MODEL', 'models/gemini-2.0-flash');
        $configValues['GEMINI_GENERAL_MODEL'] = $this->selectModelFromOptions('general', $existingGeneralModel);

        // Step 7: Request timeout
        $this->line('');
        $existingTimeout = $extractValue('GEMINI_REQUEST_TIMEOUT', '120');
        $configValues['GEMINI_REQUEST_TIMEOUT'] = $this->ask('Enter request timeout in seconds (default: 120)', $existingTimeout);

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
        $defaultIndex = 0;

        $this->line('');
        $this->line('Available models (use arrow keys to navigate, press Enter to select the default):');
        $this->line("<info>Default: {$indexedChoices[0]}</info>");

        // Use the choice method for arrow key navigation with explicit default
        $selection = $this->choice('Select model', $indexedChoices, $defaultIndex);

        // Handle the "Enter a custom model name" option
        if ($selection === 'Enter a custom model name') {
            $customModelName = $this->ask('Enter custom model name');

            if (empty($customModelName)) {
                $this->warn('No model name provided, using default.');

                return $defaultModel;
            }

            if ($this->confirm("'{$customModelName}' is not in the predefined list. Use it anyway?", true)) {
                return $customModelName;
            }

            return $this->selectModelFromOptions($taskType, $defaultModel);
        }

        // Extract the model name from the selection (it's before the first colon or space)
        preg_match('/^([^:[:space:]]+)/', $selection, $matches);
        $modelName = $matches[1] ?? $defaultModel;

        // If it's the default with [current] marker, clean it up
        if (strpos($modelName, '[current') !== false) {
            $modelName = $defaultModel;
        }

        return $modelName;
    }

    /**
     * Mask API key for display.
     */
    protected function maskApiKey(string $key): string
    {
        if (strlen($key) <= 8) {
            return '********';
        }

        return substr($key, 0, 4).'...'.substr($key, -4);
    }

    /**
     * Prompt the user for an API key.
     */
    protected function promptForApiKey(): string
    {
        $apiKey = $this->secret('Enter your Gemini API key');

        if (empty($apiKey)) {
            $this->warn('No API key provided. AI features will not be available.');
        }

        return $apiKey;
    }

    /**
     * Test the provided Gemini API key.
     */
    protected function testGeminiApiKey(string $apiKey): bool
    {
        $this->line('Testing Gemini API key...');

        try {
            // Set the key in env for testing
            putenv("GEMINI_API_KEY={$apiKey}");

            // Try to make a simple request using the general model
            $response = Gemini::generativeModel(model: config('gemini.general_model'))
                ->generateContent('Hello, this is a test from Copytree installation.');

            return $response && $response->text();
        } catch (\Exception $e) {
            $this->error('API key test failed: '.$e->getMessage());

            return false;
        }
    }

    /**
     * Save configuration values to .env file.
     */
    protected function saveConfigToEnv(string $envPath, string $envContent, array $configValues): void
    {
        $newEnvContent = $envContent;

        foreach ($configValues as $key => $value) {
            // Skip empty values
            if (empty($value)) {
                continue;
            }

            if (strpos($newEnvContent, "{$key}=") !== false) {
                // Update existing value
                $newEnvContent = preg_replace("/{$key}=([^\s]*)/", "{$key}={$value}", $newEnvContent);
            } else {
                // Add new value
                $newEnvContent .= "\n{$key}={$value}";
            }
        }

        // Ensure the file ends with a newline
        if (! empty($newEnvContent) && substr($newEnvContent, -1) !== "\n") {
            $newEnvContent .= "\n";
        }

        // Save the updated content
        file_put_contents($envPath, $newEnvContent);
        $this->info('✓ Configuration saved to .env file.');
    }

    /**
     * Set up the database for conversation history.
     */
    protected function setupDatabase(): void
    {
        $this->line('');
        $this->line('Setting up the database for conversation history...');
        try {
            // Check if the old conversation_history table already exists
            $oldTableExists = false;
            $dbPath = config('database.connections.copytree_state.database');

            if (File::exists($dbPath)) {
                // Connect to the database and check if the table exists
                $pdo = new \PDO("sqlite:{$dbPath}");
                $stmt = $pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name='conversation_history'");

                // Check if the conversation_history table exists
                $oldTableExists = $stmt->fetch() !== false;

                // Check if the migrations table exists (indicating the table was created via migrations)
                $stmtMigrations = $pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'");
                if ($stmtMigrations->fetch() !== false) {
                    $oldTableExists = false; // Not considered an "old" table if migrations table exists
                }
            }

            if ($oldTableExists) {
                $this->warn('Detected existing conversation_history table created with the old method.');
                if ($this->confirm('Would you like to recreate it using migrations? This will delete your existing conversation history.', false)) {
                    // Backup the existing database
                    $backupPath = $dbPath.'.bak.'.date('YmdHis');
                    File::copy($dbPath, $backupPath);
                    $this->info("✓ Backed up existing database to {$backupPath}");

                    // Delete the existing database file to start fresh
                    File::delete($dbPath);
                    $this->info('✓ Removed existing database to allow fresh migration');

                    // Instantiate the ConversationStateService to trigger automatic migration
                    app(SummarizationService::class); // Dependency for ConversationStateService
                    app(ConversationStateService::class);
                    $this->info('✓ Database setup completed successfully via service');
                } else {
                    $this->info('Keeping existing conversation_history table.');
                }
            } else {
                // Instantiate the ConversationStateService to trigger automatic migration
                app(SummarizationService::class); // Dependency for ConversationStateService
                app(ConversationStateService::class);
                $this->info('✓ Database setup completed successfully');
            }
        } catch (\Exception $e) {
            $this->error('Failed to setup database: '.$e->getMessage());
            $this->warn('You may need to manually check permissions or database file corruption.');
        }
    }
}
