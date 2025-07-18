<?php

namespace App\Commands;

use App\Constants\AIModelTypes;
use App\Services\ConversationStateService;
use App\Services\ProjectQuestionService;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Log;
use LaravelZero\Framework\Commands\Command;

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
        {--ask-model-size= : Specify the AI model size (small, medium, large).}
        {--no-stream : Use non-streaming mode (provides token counts for Gemini).}';

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

        $defaultProviderName = Config::get('ai.ask_defaults.provider', 'openai');
        $defaultModelSize = Config::get('ai.ask_defaults.model_size', AIModelTypes::SMALL);

        $providerName = $providerOption ?: $defaultProviderName; // e.g., 'openai', 'fireworks'
        $modelSize = $modelSizeOption ?: $defaultModelSize; // e.g., 'small', 'medium', 'large'

        // --- Start: Validation ---
        if (! Config::has("ai.providers.{$providerName}")) {
            $this->error("Error: AI provider '{$providerName}' is not configured in your config/ai.php.");

            return self::FAILURE;
        }

        $modelIdentifierPath = "ai.providers.{$providerName}.models.{$modelSize}";
        if (! Config::has($modelIdentifierPath)) {
            $this->error("Error: Model size '{$modelSize}' is not configured for provider '{$providerName}' in config/ai.php at path '{$modelIdentifierPath}'.");

            return self::FAILURE;
        }
        $modelNameString = Config::get($modelIdentifierPath); // This is the actual model string like 'gpt-4o'
        if (empty($modelNameString)) {
            $this->error("Error: Model identifier string is empty for provider '{$providerName}', size '{$modelSize}' in config/ai.php.");

            return self::FAILURE;
        }
        // --- End: Validation ---

        try {
            // ProjectQuestionService constructor is now empty
            $questionService = new ProjectQuestionService;
        } catch (\Exception $e) {
            $this->error('Failed to initialize ProjectQuestionService: '.$e->getMessage());

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

        $this->output->write("<info>Answering your question using Prism with [{$providerName}:{$modelNameString}]...</info> ");

        $fullResponseText = '';
        $inputTokens = 0;
        $outputTokens = 0;
        $cachedInputTokens = 0;

        try {
            // Check if we should use non-streaming mode
            $useStreaming = !$this->option('no-stream');
            
            if (!$useStreaming) {
                // Non-streaming mode - better for token counts with Gemini
                $response = $questionService->askQuestion(
                    $copytree,
                    $question,
                    $history,
                    $providerName,
                    $modelNameString
                );
                
                // Start a new line for the response
                $this->output->newLine();
                
                // Output the full response
                $fullResponseText = $response->text ?? '';
                $this->output->write($fullResponseText);
                
                // Get usage data from response
                if (isset($response->usage) && is_object($response->usage)) {
                    $inputTokens = $response->usage->promptTokens ?? 0;
                    $outputTokens = $response->usage->completionTokens ?? 0;
                    $cachedInputTokens = $response->usage->cacheReadInputTokens ?? 0;
                }
                
                // Ensure we end with a newline
                if (!empty($fullResponseText) && !str_ends_with($fullResponseText, "\n")) {
                    $this->output->newLine();
                }
            } else {
                // Streaming mode (default)
                $stream = $questionService->askQuestionStream(
                    $copytree,
                    $question,
                    $history,
                    $providerName,
                    $modelNameString
                );

                // Start a new line for the response
                $this->output->newLine();

                // Stream the response tokens as they arrive
                $lastChunk = null;
                foreach ($stream as $chunk) {
                $text = $chunk->text ?? '';
                if (! empty($text)) {
                    $this->output->write($text);
                    $fullResponseText .= $text;
                }
                $lastChunk = $chunk;

                // In test mode with PrismFake, check if this chunk has usage data
                // This allows tests to pass usage data in the final chunk
                if (isset($chunk->additionalContent['usage'])) {
                    $usage = $chunk->additionalContent['usage'];
                    if (is_object($usage)) {
                        $inputTokens = $usage->promptTokens ?? $inputTokens;
                        $outputTokens = $usage->completionTokens ?? $outputTokens;
                        $cachedInputTokens = $usage->cacheReadInputTokens ?? $cachedInputTokens;
                    }
                }
            }

            // Ensure we end with a newline
            if (! empty($fullResponseText) && ! str_ends_with($fullResponseText, "\n")) {
                $this->output->newLine();
            }

            // Handle additional usage data from streaming mode if we didn't get it from chunks
            if ($inputTokens === 0 && $outputTokens === 0 && isset($lastChunk) && ! empty($lastChunk->additionalContent)) {
                // Check for usage in additionalContent (some providers may put it here)
                if (isset($lastChunk->additionalContent['usage']) && is_object($lastChunk->additionalContent['usage'])) {
                    $usage = $lastChunk->additionalContent['usage'];
                    $inputTokens = $usage->promptTokens ?? 0;
                    $outputTokens = $usage->completionTokens ?? 0;
                    $cachedInputTokens = $usage->cacheReadInputTokens ?? 0;
                }
                // Some providers might include raw usage data
                elseif (isset($lastChunk->additionalContent['promptTokens'])) {
                    $inputTokens = $lastChunk->additionalContent['promptTokens'] ?? 0;
                    $outputTokens = $lastChunk->additionalContent['completionTokens'] ?? 0;
                    $cachedInputTokens = $lastChunk->additionalContent['cacheReadInputTokens'] ?? 0;
                }
            }
            } // End of streaming mode block

            // Handle OpenAI's cached token adjustment if we got usage data
            if ($inputTokens > 0 || $outputTokens > 0) {
                // OpenAI's Prism handler subtracts cached tokens from promptTokens
                // So for OpenAI, we need to calculate the total input tokens
                if ($providerName === 'openai' && $cachedInputTokens > 0) {
                    $totalInputTokens = $inputTokens + $cachedInputTokens;
                    Log::debug("OpenAI token adjustment - Non-cached: {$inputTokens}, Cached: {$cachedInputTokens}, Total: {$totalInputTokens}");
                    $inputTokens = $totalInputTokens;
                }

                // Log cached tokens if present
                if ($cachedInputTokens > 0) {
                    Log::debug("Cached input tokens from {$providerName}: {$cachedInputTokens}");
                }

                Log::debug("Prism Response Usage. Input: {$inputTokens}, Output: {$outputTokens}, Cached Input: {$cachedInputTokens}");
            }

            // --- Calculate Cost ---
            // This logic uses your existing config/ai.php for pricing, which is fine.
            // It relies on the token counts obtained from Prism.
            $totalCost = 0.0;
            $pricingConfigKey = "ai.providers.{$providerName}.pricing.{$modelSize}";
            $pricingFound = Config::has($pricingConfigKey);

            $pricesAvailable = false;

            if ($pricingFound) {
                $pricing = Config::get($pricingConfigKey);
                $inputPrice = $pricing['input'] ?? null;
                $outputPrice = $pricing['output'] ?? null;
                $cachedInputPrice = $pricing['cached_input'] ?? $inputPrice;

                $pricesAvailable = is_numeric($inputPrice) && is_numeric($outputPrice) && (is_numeric($cachedInputPrice) || $cachedInputTokens === 0);

                if ($pricesAvailable) {
                    $nonCachedInputTokens = $inputTokens - $cachedInputTokens;
                    if ($nonCachedInputTokens > 0) {
                        $totalCost += ($nonCachedInputTokens / 1000000) * $inputPrice;
                    }
                    if ($cachedInputTokens > 0 && is_numeric($cachedInputPrice) && $cachedInputPrice > 0) {
                        $totalCost += ($cachedInputTokens / 1000000) * $cachedInputPrice;
                    }
                    if ($outputTokens > 0) {
                        $totalCost += ($outputTokens / 1000000) * $outputPrice;
                    }
                } else {
                    // This log was already good
                    Log::warning("One or more pricing values (input, output, cached_input) missing or invalid for provider '{$providerName}', model size '{$modelSize}'. Cost will not be calculated.");
                    $pricingFound = false; // Correctly mark as not found if prices are invalid for calculation
                }
            } else {
                Log::warning("Pricing configuration key '{$pricingConfigKey}' not found. Cost will not be calculated.");
            }
            // --- End Calculate Cost ---

            // Check if we received an empty response
            if (empty($fullResponseText)) {
                $this->warn('Received an empty response from the AI.');
            }

            // Save State (No Tokens)
            $stateService->saveMessage($stateKey, 'user', $question);
            $stateService->saveMessage($stateKey, 'assistant', $fullResponseText);

            // Format and Display Token Output
            $this->newLine();

            if ($inputTokens > 0 || $outputTokens > 0) {
                $cachedPercentage = ($inputTokens > 0 && $cachedInputTokens > 0) ? round(($cachedInputTokens / $inputTokens) * 100, 1) : 0;
                $costString = '';
                if ($totalCost > 0) {
                    $formattedCost = number_format($totalCost, 6);
                    $costString = sprintf(', Cost: $%s', $formattedCost);
                } elseif ($pricingFound && $pricesAvailable && $totalCost == 0.0) { // Check pricesAvailable
                    $costString = ', Cost: $0.000000';
                } else {
                    $costString = ' (Cost N/A)';
                }
                $tokenInfo = sprintf(
                    'Token Usage: %s input (%s%% cached), %s output%s',
                    number_format($inputTokens),
                    $cachedPercentage,
                    number_format($outputTokens),
                    $costString
                );
                $this->info($tokenInfo);
            } else {
                // Provider-specific messaging
                if ($providerName === 'gemini') {
                    $this->comment('Token usage not available (Prism library limitation with Gemini streaming). Use --no-stream for token counts.');
                } else {
                    $this->comment('Token usage information not available in API response.');
                }
            }

            // Display Follow-up Info
            $this->info("Ask follow up questions using: `copytree ask \"{question}\" --state {$stateKey}`");

            // Garbage Collection
            $this->runGarbageCollection($stateService);

            return self::SUCCESS;

        } catch (\Prism\Prism\Exceptions\PrismException $e) { // Catch Prism's specific exception first
            $this->output->newLine();
            $this->error('Prism API Error: '.$e->getMessage());
            Log::error("Prism error during 'ask' command: {$e->getMessage()}", [
                'provider' => $providerName,
                'model' => $modelNameString,
                'exception_type' => get_class($e),
            ]);
            $this->runGarbageCollection($stateService);

            return self::FAILURE;
        } catch (\Exception $e) { // General fallback
            $this->output->newLine();
            $this->error('An unexpected error occurred: '.$e->getMessage());
            Log::error("Unexpected error during 'ask' command: {$e->getMessage()}", [
                'exception' => $e,
                'provider' => $providerName ?? 'unknown',
                'model' => $modelNameString ?? 'unknown',
                'trace' => $e->getTraceAsString(),
            ]);
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
