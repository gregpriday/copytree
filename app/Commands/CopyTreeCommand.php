<?php

namespace App\Commands;

use App\Profiles\ProfileGuesser;
use App\Profiles\ProfileLoader;
use LaravelZero\Framework\Commands\Command;

class CopyTreeCommand extends Command
{
    /**
     * The signature of the command.
     *
     * @var string
     */
    protected $signature = 'copy
        {path? : The directory path or GitHub URL (default: current working directory)}
        {--d|depth=10 : Maximum depth of the tree.}
        {--l|max-lines=0 : Maximum number of lines to show per file. Use 0 for unlimited.}
        {--t|only-tree : Include only the directory tree in the output, not the file contents.}
        {--p|profile=auto : Profile to apply. Available options: auto, none, etc.}
        {--f|filter=* : Filter files using glob patterns. Can be specified multiple times.}
        {--a|ai-filter=false : Filter files using AI based on a natural language description.}
        {--s|search=false : Search for files using a search query string.}
        {--m|modified : Only include files that have been modified since the last commit.}
        {--c|changes= : Filter for files changed between two commits in format "commit1:commit2".}
        {--o|output? : Outputs to a file. If no filename is provided, creates file in ~/.copytree/files/.}
        {--i|display : Display the output in the console.}
        {--S|stream : Stream output directly (useful for piping).}
        {--r|as-reference : Copy a reference to a temporary file instead of copying the content directly.}
        {--no-cache : Do not use or keep cached GitHub repositories.}
        {--clear-cache : Clear the GitHub repository cache and exit.}
        {--x|profile-docs : Copy the profile documentation from the docs/profiles directory.}';

    /**
     * The description of the command.
     *
     * @var string
     */
    protected $description = 'Copies the structure and optionally the contents of a local directory or GitHub repository to your clipboard or a file. Leverage customizable profiles, glob filters, AI-based file selection, and Git integration to tailor the output for code analysis and sharing with AI assistants.';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        // Use the current working directory as the project path.
        $projectPath = getcwd();

        // Use ProfileGuesser to determine which profile (ruleset) to load.
        $profileGuesser = new ProfileGuesser($projectPath);
        $guessedProfile = $profileGuesser->guess();
        $profilePath = $profileGuesser->getProfilePath($guessedProfile);

        // Load the profile configuration into Laravel config
        $profileLoader = new ProfileLoader();
        $profileLoader->load($profilePath, [
            'profile'    => $this->option('profile'),
            'filter'     => (array) $this->option('filter'),
            'ai_filter'  => $this->option('ai-filter') !== false ? $this->option('ai-filter') : null,
            'search'     => $this->option('search'),
            'modified'   => $this->option('modified'),
            'changes'    => $this->option('changes'),
            'depth'      => (int) $this->option('depth'),
            'max_lines'  => (int) $this->option('max-lines'),
        ]);

        // For now, simply output the loaded profile and exit.
        $this->info('Profile loaded successfully.');
        $this->info('Profile configuration:');
        $this->line(print_r(config('profile'), true));

        // Exit the command (functionality to copy the tree will be added later)
        // You could return Command::SUCCESS when using the Laravel Zero style.
        return Command::SUCCESS;
    }
}
