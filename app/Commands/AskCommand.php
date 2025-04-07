<?php

namespace App\Commands;

use App\Services\ConversationStateService;
use App\Services\ExpertSelectorService;
use App\Services\ProjectQuestionService;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Log;
use LaravelZero\Framework\Commands\Command;
use ValueError;

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
        {--s|state= : Optional state key to continue a previous conversation. If not provided, a new state key is generated.}';

    /**
     * The description of the command.
     *
     * @var string
     */
    protected $description = 'Ask a question about the project codebase with the ability to maintain conversation state.';

    /**
     * Execute the console command.
     */
    public function handle(ProjectQuestionService $questionService, ExpertSelectorService $expertSelectorService, ConversationStateService $stateService): int
    {
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
        if ($expert === 'auto') {
            try {
                $expert = $expertSelectorService->selectExpert($question);
                // If we get the default expert after auto-selection, let the user know
            } catch (\Exception $e) {
                $this->warning('Expert auto-selection failed, using default expert instead: '.$e->getMessage());
                $expert = ExpertSelectorService::DEFAULT_EXPERT;
            }
        }

        $this->output->write("<info>Thinking about your question (using expert: {$expert})...</info> ");
        $this->output->newLine();

        $fullResponseText = ''; // Accumulate the full response

        try {
            // Pass history to the question service
            $stream = $questionService->askQuestion($copytree, $question, $expert, $history);

            // Process and display each partial response as it arrives
            foreach ($stream as $partialResponse) {
                try {
                    // Use optional chaining to safely access nested properties
                    $text = $partialResponse?->candidates[0]?->content?->parts[0]?->text;

                    if ($text !== null) {
                        // Text found via the expected path
                        $this->output->write($text);
                        $fullResponseText .= $text;
                    } elseif (method_exists($partialResponse, 'text')) {
                        // Fallback to the text() method if the primary path failed
                        try {
                            $fallbackText = $partialResponse->text();
                            if (!empty($fallbackText)) {
                                $this->output->write($fallbackText);
                                $fullResponseText .= $fallbackText;
                            }
                        } catch (\Exception $textException) {
                            // Log but silently ignore text() method errors
                            Log::debug('Fallback text() method failed for a chunk.', [
                                'stateKey' => $stateKey ?? 'unknown', 
                                'error' => $textException->getMessage()
                            ]);
                        }
                    } else {
                        // Optional: Log chunks that don't match either structure for debugging
                        Log::debug('Received Gemini chunk with unexpected structure.', [
                            'stateKey' => $stateKey ?? 'unknown',
                            'chunk_structure' => json_encode($partialResponse) // Log the structure
                        ]);
                    }
                } catch (\Exception $e) {
                    // Log the error for troubleshooting
                    Log::warning('Error processing Gemini response chunk: ' . $e->getMessage(), [
                        'stateKey' => $stateKey ?? 'unknown',
                        'error' => $e->getMessage(),
                        'trace' => $e->getTraceAsString(),
                        'chunk_structure' => json_encode($partialResponse) // Log structure on error
                    ]);
                    // We're intentionally ignoring issues with malformed responses
                    // as a fallback for the more robust checking above
                }
            }

            // Add a final newline after the complete response
            $this->output->newLine();

            // Save interaction - state key will always be set now
            $stateService->saveMessage($stateKey, 'user', $question);
            $stateService->saveMessage($stateKey, 'model', $fullResponseText);

            $this->newLine();
            $this->info("Ask follow up questions using: `copytree ask \"{question}\" --state {$stateKey}`");

            // Perform silent garbage collection
            $this->runGarbageCollection($stateService);

            return self::SUCCESS;
        } catch (ValueError $e) {
            $this->error('Gemini API Content Error: '.$e->getMessage());
            $this->info('This error can occur when content is filtered by safety systems. Try rephrasing your question.');

            // Perform silent garbage collection even on failure
            $this->runGarbageCollection($stateService);

            return self::FAILURE;
        } catch (\Exception $e) {
            // Check for common errors with specific messaging
            if (str_contains($e->getMessage(), "Undefined array key 'parts'")) {
                $this->error('Error: Malformed response from Gemini API: '.$e->getMessage());
                $this->info('This is usually a temporary issue with the response format. Please try your question again.');
            } else if (str_contains($e->getMessage(), "API key not valid")) {
                $this->error('Error: Gemini API key validation failed: '.$e->getMessage());
                $this->info('Please check that your API key is correctly set in your .env file or environment variables.');
            } else {
                $this->error('Error: '.$e->getMessage());
            }

            // Log the full error for developer troubleshooting
            Log::error('AskCommand error: '.$e->getMessage(), [
                'exception' => get_class($e),
                'trace' => $e->getTraceAsString(),
            ]);

            // Perform silent garbage collection even on failure
            $this->runGarbageCollection($stateService);

            return self::FAILURE;
        }
    }

    /**
     * Display a list of available experts.
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
