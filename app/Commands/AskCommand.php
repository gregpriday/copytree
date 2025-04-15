<?php

namespace App\Commands;

use App\Constants\AIModelTypes;
use App\Constants\ExpertNames;
use App\Services\ConversationStateService;
use App\Services\ExpertSelectorService;
use App\Services\ProjectQuestionService;
use Illuminate\Support\Facades\Artisan;
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
        {--e|expert=auto : The expert to use for answering the question (use "auto" for automatic selection).}
        {--question-file= : Read the question from a file.}
        {--s|state= : Optional state key to continue a previous conversation. If not provided, a new state key is generated.}
        {--order-by=modified : Specify the file ordering for the context (default|modified).}';

    /**
     * The description of the command.
     *
     * @var string
     */
    protected $description = 'Ask a question about the project codebase with the ability to maintain conversation state.';

    /**
     * Execute the console command.
     *
     * @param  ProjectQuestionService  $questionService  Service to ask questions about the project
     * @param  ExpertSelectorService  $expertSelectorService  Service to select appropriate experts
     * @param  ConversationStateService  $stateService  Service to manage conversation state
     * @return int Command exit code
     */
    public function handle(
        ProjectQuestionService $questionService,
        ExpertSelectorService $expertSelectorService,
        ConversationStateService $stateService
    ): int {
        $path = $this->argument('path') ?: getcwd();
        $question = null; // Initialize question as null

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
            // Special case for --show-experts command
            if ($this->argument('question') === '--show-experts') {
                $this->showExperts($questionService);

                return self::SUCCESS;
            }

            $this->error('Error: No question provided. Please provide a question as an argument, via --question-file, or pipe it via stdin.');

            return self::FAILURE;
        }

        // Trim whitespace from the question
        $question = trim($question);

        $expert = $this->option('expert');

        // Handle state management
        $history = [];
        $stateKeyInput = $this->option('state');

        // If a non-empty state key was provided, use it to continue conversation
        if (! empty($stateKeyInput)) {
            $stateKey = $stateKeyInput;
            $this->info("Continuing conversation with state key: {$stateKey}");

            // Load history for the provided key
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

        // Determine the expert to use with proper error handling
        if ($expert === ExpertNames::AUTO) {
            try {
                $expertConfig = $expertSelectorService->selectConfig($question);
                // If we get the default expert after auto-selection, let the user know
            } catch (\Exception $e) {
                $this->warning('Expert auto-selection failed, using default expert instead: '.$e->getMessage());
                $expertConfig = [
                    'expert' => $expert,
                    'provider' => ExpertSelectorService::DEFAULT_PROVIDER,
                    'model' => AIModelTypes::MEDIUM,
                ];
            }
        } else {
            // Use the specified expert but with default provider and model
            $expertConfig = [
                'expert' => $expert,
                'provider' => ExpertSelectorService::DEFAULT_PROVIDER,
                'model' => AIModelTypes::MEDIUM,
            ];
        }

        $this->output->write("<info>Answering your question (using expert: {$expertConfig['expert']}, provider: {$expertConfig['provider']}, model:{$expertConfig['model']})...</info> ");

        $fullResponseText = '';
        $inputTokens = 0;
        $outputTokens = 0;
        $cachedInputTokens = 0;

        try {
            // --- Call the NON-STREAMING service method ---
            $apiResponse = $questionService->askQuestion($copytree, $question, $expertConfig, $history);

            // --- Extract Content ---
            // Adjust the path based on the actual structure of \OpenAI\Responses\Chat\CreateResponse
            $fullResponseText = $apiResponse->choices[0]->message->content ?? '';

            // --- Extract Accurate Token Usage ---
            $usage = $apiResponse->usage ?? null;
            if ($usage) {
                $inputTokens = $usage->promptTokens ?? 0;
                $outputTokens = $usage->completionTokens ?? 0;

                // Attempt to get cached tokens (path might vary slightly)
                $promptDetails = $usage->promptTokensDetails ?? null;
                $cachedInputTokens = $promptDetails->cachedTokens ?? 0;
            } else {
                 Log::warning('Token usage data missing from API response.', ['response_id' => $apiResponse->id ?? 'N/A']);
            }

            // --- Calculate Cost ---
            $totalCost = 0.0;
            $provider = $expertConfig['provider'];
            $modelSize = $expertConfig['model']; // This should be 'small', 'medium', or 'large'
            $pricingConfigKey = "ai.providers.{$provider}.pricing.{$modelSize}";
            $pricingFound = config()->has($pricingConfigKey);
            if ($pricingFound) {
                $pricing = config($pricingConfigKey);
                $inputPrice = $pricing['input'] ?? 0.0;
                $outputPrice = $pricing['output'] ?? 0.0;
                $cachedInputPrice = $pricing['cached_input'] ?? 0.0;
                $nonCachedInputTokens = $inputTokens - $cachedInputTokens;
                if ($nonCachedInputTokens > 0) {
                    $totalCost += ($nonCachedInputTokens / 1000000) * $inputPrice;
                }
                if ($cachedInputTokens > 0) {
                    $totalCost += ($cachedInputTokens / 1000000) * $cachedInputPrice;
                }
                if ($outputTokens > 0) {
                    $totalCost += ($outputTokens / 1000000) * $outputPrice;
                }
            } else {
                Log::warning("Pricing configuration not found for provider '{$provider}', model size '{$modelSize}'. Cost will not be calculated.");
            }
            // --- End Calculate Cost ---

            // --- Display Response ---
            $this->output->newLine(); // Add newline before showing response
            if (!empty($fullResponseText)) {
                $this->line($fullResponseText); // Display the full response at once
            } else {
                 $this->warning('Received an empty response from the AI.');
            }

            // --- Save State (No Tokens) ---
            $stateService->saveMessage($stateKey, 'user', $question); // [cite: 48]
            $stateService->saveMessage($stateKey, 'assistant', $fullResponseText); // [cite: 49]

            // --- Format and Display Token Output ---
            $this->newLine(); // Add separation

            if ($inputTokens > 0 || $outputTokens > 0) {
                // Calculate cached percentage using the ACCURATE counts
                $cachedPercentage = $inputTokens > 0 ?
                    round(($cachedInputTokens / $inputTokens) * 100, 1) : 0;

                // Format cost string (only show if cost > 0 and pricing was found)
                $costString = '';
                if ($totalCost > 0) {
                    $formattedCost = number_format($totalCost, 6); // Adjust precision as needed
                    $costString = sprintf(", Cost: $%s", $formattedCost);
                } elseif ($pricingFound && $totalCost == 0) {
                    $costString = ", Cost: $0.00";
                } else {
                    $costString = " (Cost N/A)";
                }

                // Format and display token usage AND cost
                $tokenInfo = sprintf(
                    "Token Usage: %s input (%s%% cached), %s output%s",
                    number_format($inputTokens),
                    $cachedPercentage,
                    number_format($outputTokens),
                    $costString
                );
                $this->info($tokenInfo);
            } else {
                // Message if usage data was missing from response
                $this->comment('Token usage information not available in API response.');
            }

            // --- Display Follow-up Info ---
            $this->info("Ask follow up questions using: `copytree ask \"{question}\" --state {$stateKey}`"); // [cite: 50]

            // --- Garbage Collection ---
            $this->runGarbageCollection($stateService); // [cite: 50]

            return self::SUCCESS; // [cite: 50]

        } catch (\Exception $e) {
            // Log error to console and log file
            Log::error('API Error: '.$e->getMessage(), [ // [cite: 51]
                'stateKey' => $stateKey ?? 'unknown',
                'exception' => get_class($e),
                'trace' => $e->getTraceAsString(),
            ]); // [cite: 52]

            // Different error message since we didn't stream
            $this->error('Failed to generate a response. Please check logs or try again. Error: '.$e->getMessage());

            $this->runGarbageCollection($stateService); // [cite: 57]
            return self::FAILURE; // [cite: 57]
        }
    }

    /**
     * Display a list of available experts.
     *
     * @param  ProjectQuestionService  $questionService  Service to query available experts
     */
    protected function showExperts(ProjectQuestionService $questionService): void
    {
        $experts = $questionService->getAvailableExperts();

        $this->info('Available experts:');
        foreach ($experts as $expertName => $description) {
            $this->line('- <comment>'.$expertName.'</comment>'.($expertName === 'default' ? ' (default)' : ''));
            $this->line('  '.$description);
        }

        $this->info("You can also use '--expert=auto' to automatically select the best expert based on your question and project.");
        $this->newLine();
        $this->line('Usage examples:');
        $this->line('- <comment>copytree ask "Your question here" --expert=expert_name</comment> (replace expert_name with one of the above)');
        $this->line('- <comment>copytree ask "Your question here" --expert=auto</comment> (for automatic selection)');
    }

    /**
     * Run the state garbage collection silently.
     *
     * @param  ConversationStateService  $stateService  Service to manage conversation state
     */
    protected function runGarbageCollection(ConversationStateService $stateService): void
    {
        try {
            $gcDays = config('state.garbage_collection.default_days', 7);
            if ($gcDays > 0) {
                $stateService->deleteOldStates($gcDays);
            }
        } catch (\Exception $e) {
            // Fail silently, no logging needed
        }
    }
}
