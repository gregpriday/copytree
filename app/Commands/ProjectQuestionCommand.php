<?php

namespace App\Commands;

use App\Services\ProjectQuestionService;
use Illuminate\Support\Facades\Artisan;
use LaravelZero\Framework\Commands\Command;

class ProjectQuestionCommand extends Command
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
        {--c|changes= : Filter for files changed between two commits in format "commit1:commit2".}';

    /**
     * The description of the command.
     *
     * @var string
     */
    protected $description = 'Ask a question about the project codebase and get AI assistance';

    /**
     * Execute the console command.
     */
    public function handle(ProjectQuestionService $questionService): int
    {
        $path = $this->argument('path') ?: getcwd();
        $question = $this->argument('question');

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

        $this->output->write('<info>Thinking about your question...</info> ');
        $this->output->newLine();

        try {
            // Get the response from the question service
            $response = $questionService->askQuestion($copytree, $question);

            // Output the response
            $this->line($response);

            return self::SUCCESS;
        } catch (\Exception $e) {
            $this->error('Error: '.$e->getMessage());

            return self::FAILURE;
        }
    }
}
