<?php

namespace App\Commands;

use App\Constants\AIModelTypes;
use App\Services\ConversationStateService;
use App\Services\ProjectQuestionService;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Log;
use LaravelZero\Framework\Commands\Command;
use Illuminate\Support\Facades\Config;
use InvalidArgumentException;

class AskCommand extends Command
{
    /**
     * The signature of the command.
     *
     * @var string
     */
    protected $signature = 'ask
        {question? : The question to ask about the project (optional if using --question-file or stdin)}
        {path? : The directory path or GitHub URL (default: current working directory)}
        {--d|depth=10 : Maximum depth of the tree.}
        {--p|profile=auto : Profile to apply.}
        {--f|filter=* : Filter files using glob patterns.}
        {--a|ai-filter=* : Filter files using AI based on a natural language description.}
        {--m|modified : Only include files that have been modified since the last commit.}
        {--c|changes= : Filter for files changed between two commits in format "commit1:commit2".}
        {--question-file= : Read the question from a file.}
        {--s|state= : Optional state key to continue a previous conversation.}
        {--order-by=modified : Specify the file ordering for the context (default|modified).}
        {--ask-provider= : Specify the AI provider for asking questions (e.g., openai, gemini).}
        {--ask-model-size= : Specify the AI model size (small, medium, large).}';

    /**
     * The description of the command.
     *
     * @var string
     */
    protected $description = 'Ask a question about the project codebase with the ability to maintain conversation state.';

    /**
     * Execute the console command.
     *
     * @param  ConversationStateService  $stateService  Service to manage conversation state
     * @return int Command exit code
     */
    public function handle(ConversationStateService $stateService): int
    {
        // --- Start: Determine Provider and Model ---
        $providerOption = $this->option('ask-provider');
        $modelSizeOption = $this->option('ask-model-size');

        // Get defaults from the new config section
        $defaultProvider = Config::get('ai.ask_defaults.provider', 'openai');
        $defaultModelSize = Config::get('ai.ask_defaults.model_size', AIModelTypes::SMALL);

        // Use option if provided, otherwise use default
        $provider = $providerOption ?: $defaultProvider;
        $modelSize = $modelSizeOption ?: $defaultModelSize;

        // --- Start: Validation ---
        // Validate Provider
        if (!Config::has("ai.providers.{$provider}")) {
            $this->error("Error: AI provider '{$provider}' is not configured in config/ai.php.");
            return self::FAILURE;
        }

        // Validate Model Size
        $validModelSizes = [AIModelTypes::SMALL, AIModelTypes::MEDIUM, AIModelTypes::LARGE];
        if (!in_array($modelSize, $validModelSizes)) {
            $this->error("Error: Invalid model size '{$modelSize}'. Valid options are: " . implode(', ', $validModelSizes));
            return self::FAILURE;
        }

        // Validate Model exists for Provider/Size combination
        $modelConfigPath = "ai.providers.{$provider}.models.{$modelSize}";
        if (!Config::has($modelConfigPath)) {
            $this->error("Error: Model size '{$modelSize}' is not configured for provider '{$provider}' in config/ai.php.");
            return self::FAILURE;
        }
        // --- End: Validation ---

        // Manually instantiate ProjectQuestionService with the determined provider and model size
        try {
            $questionService = new ProjectQuestionService($provider, $modelSize);
        } catch (\Exception $e) {
            $this->error("Failed to initialize ProjectQuestionService: " . $e->getMessage());
            return self::FAILURE;
        }
        // --- End: Determine Provider and Model ---

        $path = $this->argument('path') ?: getcwd();
        $question = null;

        // Check for --question-file
        $questionFile = $this->option('question-file');
        if ($questionFile) {
            if (! file_exists($questionFile) || ! is_readable($questionFile)) {
                $this->error("Error: Question file not found or not readable: {$questionFile}");

                return self::FAILURE;
            }
            $question = file_get_contents($questionFile);
            if ($question === false) {
                $this->error("Error: Could not read question file: {$questionFile}");

                return self::FAILURE;
            }
            $this->info("Reading question from file: {$questionFile}");
        }

        // Check for question argument (if file wasn't used)
        if (is_null($question)) {
            $questionArg = $this->argument('question');
            if ($questionArg) {
                $question = $questionArg;
            }
        }

        // Check for stdin (if file and argument weren't used)
        if (is_null($question)) {
            // Check if stdin is associated with a terminal (false if piped/redirected)
            if (stream_isatty(STDIN) === false) {
                $stdinContent = stream_get_contents(STDIN);
                if (! empty(trim($stdinContent))) {
                    $question = $stdinContent;
                    $this->info('Reading question from stdin.');
                }
            }
        }

        // Validate that we have a question
        if (is_null($question) || trim($question) === '') {
            $this->error('Error: No question provided. Please provide a question as an argument, via --question-file, or pipe it via stdin.');

            return self::FAILURE;
        }

        // Trim whitespace from the question
        $question = trim($question);

        // Handle state management
        $history = [];
        $stateKey = $this->option('state');

        // If a non-empty state key was provided, use it to continue conversation
        if ($stateKey) {
            $this->info("Continuing conversation with state key: {$stateKey}");
            $history = $stateService->loadHistory($stateKey);
            if (! empty($history)) {
                $this->comment('Loaded previous conversation history.');
            } else {
                $this->comment('No previous history found for this state key. Starting fresh.');
            }
        } else {
            // No state key provided, always generate a new one
            $stateKey = $stateService->generateStateKey();
            $this->info("Starting new conversation with state key: {$stateKey}");
            $history = [];
        }

        // Generate copytree output for the project
        $options = [
            'path' => $path,
            '--display' => true,
            '--depth' => $this->option('depth'),
            '--profile' => $this->option('profile'),
            '--filter' => $this->option('filter'),
            '--ai-filter' => $this->option('ai-filter'),
            '--order-by' => $this->option('order-by'),
        ];

        if ($this->option('modified')) {
            $options['--modified'] = true;
        }

        if ($this->option('changes')) {
            $options['--changes'] = $this->option('changes');
        }

        // Capture the copy command output
        Artisan::call('copy', $options);
        $copytree = Artisan::output();

        // Use a simpler output message
        $this->output->write("<info>Answering your question using [{$provider}:{$modelSize}]...</info> ");

        $fullResponseText = '';
        $inputTokens = 0;
        $outputTokens = 0;
        $cachedInputTokens = 0;

        try {
            // Call the NON-STREAMING service method
            $apiResponse = $questionService->askQuestion($copytree, $question, $history);

            // Extract Content
            $fullResponseText = $apiResponse->choices[0]->message->content ?? '';

            // Extract Accurate Token Usage
            $usage = $apiResponse->usage ?? null;
            if ($usage) {
                $inputTokens = $usage->promptTokens ?? 0;
                $outputTokens = $usage->completionTokens ?? 0;
                $promptDetails = $usage->promptTokensDetails ?? null;
                $cachedInputTokens = $promptDetails->cachedTokens ?? 0;
            } else {
                 Log::warning('Token usage data missing from API response.', ['response_id' => $apiResponse->id ?? 'N/A']);
            }

            // Calculate Cost (Use the determined provider and model size)
            $totalCost = 0.0;
            $pricingConfigKey = "ai.providers.{$provider}.pricing.{$modelSize}";
            $pricingFound = Config::has($pricingConfigKey);

            if ($pricingFound) {
                $pricing = Config::get($pricingConfigKey);

                $inputPrice = $pricing['input'] ?? null;
                $outputPrice = $pricing['output'] ?? null;
                $cachedInputPrice = $pricing['cached_input'] ?? $inputPrice;

                $pricesAvailable = is_numeric($inputPrice) && is_numeric($outputPrice) && is_numeric($cachedInputPrice);
                if ($pricesAvailable) {
                    $nonCachedInputTokens = $inputTokens - $cachedInputTokens;
                    if ($nonCachedInputTokens > 0) {
                        $totalCost += ($nonCachedInputTokens / 1000000) * $inputPrice;
                    }
                    if ($cachedInputTokens > 0 && $cachedInputPrice > 0) {
                        $totalCost += ($cachedInputTokens / 1000000) * $cachedInputPrice;
                    }
                    if ($outputTokens > 0) {
                        $totalCost += ($outputTokens / 1000000) * $outputPrice;
                    }
                } else {
                    $totalCost = 0.0;
                    $pricingFound = false;
                    Log::warning("One or more pricing values (input, output) missing or invalid for provider '{$provider}', model size '{$modelSize}'. Cost will not be calculated.");
                }
            } else {
                Log::warning("Pricing configuration key '{$pricingConfigKey}' not found. Cost will not be calculated.");
            }

            // Display Response
            $this->output->newLine();
            if (!empty($fullResponseText)) {
                $this->line($fullResponseText);
            } else {
                 $this->warning('Received an empty response from the AI.');
            }

            // Save State (No Tokens)
            $stateService->saveMessage($stateKey, 'user', $question);
            $stateService->saveMessage($stateKey, 'assistant', $fullResponseText);

            // Format and Display Token Output
            $this->newLine();

            if ($inputTokens > 0 || $outputTokens > 0) {
                $cachedPercentage = $inputTokens > 0 ? round(($cachedInputTokens / $inputTokens) * 100, 1) : 0;
                $costString = '';
                if ($totalCost > 0) {
                    $formattedCost = number_format($totalCost, 6);
                    $costString = sprintf(", Cost: $%s", $formattedCost);
                } elseif ($pricingFound && $totalCost == 0) {
                    $costString = ", Cost: $0.00";
                } else {
                    $costString = " (Cost N/A)";
                }
                $tokenInfo = sprintf(
                    "Token Usage: %s input (%s%% cached), %s output%s",
                    number_format($inputTokens),
                    $cachedPercentage,
                    number_format($outputTokens),
                    $costString
                );
                $this->info($tokenInfo);
            } else {
                $this->comment('Token usage information not available in API response.');
            }

            // Display Follow-up Info
            $this->info("Ask follow up questions using: `copytree ask \"{question}\" --state {$stateKey}`");

            // Garbage Collection
            $this->runGarbageCollection($stateService);

            return self::SUCCESS;

        } catch (\Exception $e) {
            $this->output->newLine();
            $this->error('Error: '. $e->getMessage());
            Log::error("Error during question processing: {$e->getMessage()}", ['exception' => $e]);
            $this->runGarbageCollection($stateService);
            return self::FAILURE;
        }
    }

    /**
     * Run garbage collection for old state files.
     *
     * @param  ConversationStateService  $stateService  Service to manage conversation state
     */
    protected function runGarbageCollection(ConversationStateService $stateService): void
    {
        $deletedCount = $stateService->deleteOldStates();
        if ($deletedCount > 0) {
            Log::info("Garbage collected {$deletedCount} old state files.");
        }
    }
}
