<?php

namespace App\Commands;

use App\Services\ExpertSelectorService;
use App\Services\ProjectQuestionService;
use Illuminate\Support\Facades\Artisan;
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
        {question : The question to ask about the project}
        {path? : The directory path or GitHub URL (default: current working directory)}
        {--d|depth=10 : Maximum depth of the tree.}
        {--p|profile=auto : Profile to apply.}
        {--f|filter=* : Filter files using glob patterns.}
        {--a|ai-filter=* : Filter files using AI based on a natural language description.}
        {--m|modified : Only include files that have been modified since the last commit.}
        {--c|changes= : Filter for files changed between two commits in format "commit1:commit2".}
        {--e|expert=auto : The expert to use for answering the question (use "auto" for automatic selection).}';

    /**
     * The description of the command.
     *
     * @var string
     */
    protected $description = 'Ask a question about the project codebase and get AI assistance with streaming output';

    /**
     * Execute the console command.
     */
    public function handle(ProjectQuestionService $questionService, ExpertSelectorService $expertSelectorService): int
    {
        $path = $this->argument('path') ?: getcwd();
        $question = $this->argument('question');
        $expert = $this->option('expert');

        // Show available experts if requested with special flag
        if ($question === '--show-experts') {
            $this->showExperts($questionService);

            return self::SUCCESS;
        }

        // Show a spinner while generating the copytree
        $this->output->write('<info>Analyzing project structure...</info> ');
        $this->output->newLine();

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
                if ($expert === ExpertSelectorService::DEFAULT_EXPERT) {
                    $this->comment('Note: Expert auto-selection defaulted to "default" expert. This may happen due to API limitations or content filters.');
                }
            } catch (\Exception $e) {
                $this->warning('Expert auto-selection failed, using default expert instead: '.$e->getMessage());
                $expert = ExpertSelectorService::DEFAULT_EXPERT;
            }
        }

        $this->output->write("<info>Thinking about your question (using expert: {$expert})...</info> ");
        $this->output->newLine();

        try {
            // Get the stream of responses from the question service
            $stream = $questionService->askQuestion($copytree, $question, $expert);

            // Process and display each partial response as it arrives
            foreach ($stream as $partialResponse) {
                $this->output->write($partialResponse->text());
            }

            // Add a final newline after the complete response
            $this->output->newLine();

            return self::SUCCESS;
        } catch (ValueError $e) {
            $this->error('Gemini API Content Error: '.$e->getMessage());
            $this->info('This error can occur when content is filtered by safety systems. Try rephrasing your question.');

            return self::FAILURE;
        } catch (\Exception $e) {
            $this->error('Error: '.$e->getMessage());

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
}
