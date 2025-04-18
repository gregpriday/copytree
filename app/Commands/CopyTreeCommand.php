<?php

namespace App\Commands;

use App\Events\DuplicateFileFoundEvent;
use App\Events\TransformCompleteEvent;
use App\Pipeline\FileLoader;
use App\Pipeline\RulesetFilter;
use App\Pipeline\Stages\AIFilterStage;
use App\Pipeline\Stages\AlwaysIncludeStage;
use App\Pipeline\Stages\ComposerStage;
use App\Pipeline\Stages\DeduplicateFilesStage;
use App\Pipeline\Stages\ExternalSourceStage;
use App\Pipeline\Stages\GitFilterStage;
use App\Pipeline\Stages\NPMStage;
use App\Pipeline\Stages\RulesetFilterStage;
use App\Pipeline\Stages\SortFilesStage;
use App\Profiles\ProfileGuesser;
use App\Profiles\ProfileLoader;
use App\Renderer\FileOutputRenderer;
use App\Renderer\SizeReportRenderer;
use App\Renderer\TreeRenderer;
use App\Services\ByteCounter;
use App\Services\GitHubUrlHandler;
use App\Utilities\Clipboard;
use App\Utilities\TempFileManager;
use CzProject\GitPhp\Git;
use CzProject\GitPhp\GitException;
use Exception;
use Illuminate\Pipeline\Pipeline;
use Illuminate\Support\Facades\Event;
use LaravelZero\Framework\Commands\Command;
use Symfony\Component\Process\Process;

class CopyTreeCommand extends Command
{
    /**
     * The signature of the command.
     *
     * Note that the "output" option now uses "=" so that it is always registered.
     */
    protected $signature = 'copy
        {path? : The directory path or GitHub URL (default: current working directory)}
        {--d|depth=10 : Maximum depth of the tree.}
        {--l|max-lines=0 : Maximum number of lines to show per file. Use 0 for unlimited.}
        {--C|max-characters=0 : Maximum number of characters to show per file. Use 0 for unlimited.}
        {--t|only-tree : Include only the directory tree in the output, not the file contents.}
        {--p|profile=auto : Profile to apply.}
        {--f|filter=* : Filter files using glob patterns.}
        {--a|ai-filter=* : Filter files using AI based on a natural language description.}
        {--m|modified : Only include files that have been modified since the last commit.}
        {--c|changes= : Filter for files changed between two commits in format "commit1:commit2".}
        {--o|output= : Outputs to a file. If no filename is provided, creates a temporary file (will be automatically cleaned up after 24 hours).}
        {--i|display : Display the output in the console.}
        {--S|stream : Stream output directly (useful for piping).}
        {--r|as-reference : Copy a reference to a temporary file instead of copying the content directly.}
        {--no-cache : Do not use or keep cached GitHub repositories.}
        {--s|size-report : Display a report of files sorted by size after transformation.}
        {--order-by=default : Specify the file ordering (default|modified).}';

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
        // Clean up old temporary files before processing the command
        TempFileManager::cleanOldFiles();

        // Display warning if this is not macOS
        if (PHP_OS_FAMILY !== 'Darwin') {
            $this->warn('This command is designed for macOS and may not work as expected on other operating systems.');
        }

        // Use the provided path argument or fallback to the current working directory.
        $projectPath = $this->argument('path') ?: getcwd();

        // If the provided project path is a GitHub URL, clone the repository and use the local path.
        if (str_starts_with($projectPath, 'https://github.com/')) {
            $handler = new GitHubUrlHandler($projectPath);
            $projectPath = $handler->getFiles();
        }

        try {
            // Load the profile configuration.
            $profileGuesser = new ProfileGuesser($projectPath);
            $profileName = $this->option('profile') === 'auto'
                ? $profileGuesser->guess()
                : $this->option('profile');
            $profilePath = $profileGuesser->getProfilePath($profileName);
        } catch (Exception $e) {
            $this->error('Profile error: '.$e->getMessage());

            return self::FAILURE;
        }

        $profileLoader = new ProfileLoader($projectPath);
        $profileLoader->load($profilePath, [
            'profile' => $this->option('profile'),
            'filter' => (array) $this->option('filter'),
            'ai_filter' => $this->option('ai-filter') !== false ? $this->option('ai-filter') : null,
            'modified' => $this->option('modified'),
            'changes' => $this->option('changes'),
            'depth' => (int) $this->option('depth'),
            'max_lines' => (int) $this->option('max-lines'),
        ]);

        // Load the initial file set.
        $depth = (int) $this->option('depth');
        $fileLoader = new FileLoader($projectPath);
        $files = $fileLoader->loadFiles($depth);

        // Track duplicate files for verbose output
        $duplicates = [];
        Event::listen(DuplicateFileFoundEvent::class, function ($event) use (&$duplicates) {
            $duplicates[$event->file->getRelativePathname()] = true;
        });

        // Build the pipeline using a Laravel Pipeline.
        $pipeline = app(Pipeline::class)->send($files);

        // Add Git filtering if requested.
        if ($this->option('modified') || $this->option('changes')) {
            $pipeline->pipe([
                new GitFilterStage($projectPath, (bool) $this->option('modified'), $this->option('changes')),
            ]);
        }

        // Add AI filtering if requested.
        $aiFilters = (array) $this->option('ai-filter');
        foreach ($aiFilters as $filterDescription) {
            $pipeline->pipe([
                new AIFilterStage($filterDescription),
            ]);
        }

        // Add external sources if configured in the profile.
        if (config('profile.external')) {
            $pipeline->pipe([
                new ExternalSourceStage(config('profile.external')),
            ]);
        }

        // Apply ruleset filtering if configured.
        if (config('profile.include') || config('profile.exclude')) {
            $pipeline->pipe([
                new RulesetFilterStage(
                    new RulesetFilter(
                        config('profile.include', []),
                        config('profile.exclude', []),
                        config('profile.always', [])
                    )
                ),
            ]);
        }

        // Check for composer.json and add ComposerStage if it exists
        if (file_exists($projectPath.DIRECTORY_SEPARATOR.'composer.json')) {
            $pipeline->pipe([
                new ComposerStage($projectPath),
            ]);
        }

        // Check for package.json and add NPMStage if it exists
        if (file_exists($projectPath.DIRECTORY_SEPARATOR.'package.json')) {
            $pipeline->pipe([
                new NPMStage($projectPath),
            ]);
        }

        // Add DeduplicateFilesStage to remove duplicate files based on content
        $pipeline->pipe([
            new DeduplicateFilesStage,
        ]);

        // Always add a sorting stage.
        $pipeline->pipe([
            new SortFilesStage($this->option('order-by')),
        ]);

        // Add AlwaysIncludeStage as the last stage to ensure "always" files are included
        // regardless of earlier exclusions.
        if (! empty(config('profile.always', []))) {
            $pipeline->pipe([
                new AlwaysIncludeStage($projectPath, config('profile.always', [])),
            ]);
        }

        // Execute the pipeline.
        $finalFiles = $pipeline->then(function ($files) {
            return $files;
        });

        // If the size-report option is selected, render the size report and exit
        if ($this->option('size-report')) {
            $maxLines = (int) $this->option('max-lines');
            $maxCharacters = (int) $this->option('max-characters');

            $sizeReportRenderer = app(SizeReportRenderer::class);
            $sizeReportRenderer->render($finalFiles, $this->output, $maxLines, $maxCharacters);

            return self::SUCCESS;
        }

        // Render the tree view.
        $treeRenderer = new TreeRenderer;
        $treeOutput = $treeRenderer->render($finalFiles);

        // Render file contents output if not in only-tree mode.
        $fileOutput = '';
        if (! $this->option('only-tree')) {
            // Resolve the FileOutputRenderer so that its dependency (FileTransformer) is injected.
            $fileRenderer = app(FileOutputRenderer::class);

            // Initialize Git repository if the project path is a Git repository
            try {
                $git = new Git;
                $gitRepo = $git->open($projectPath);
                $fileRenderer->setGitRepository($gitRepo);
            } catch (GitException $e) {
                // Not a Git repository or Git error, continue without Git information
            }

            $transformCount = $fileRenderer->countPendingTransforms($finalFiles);

            $maxLines = (int) $this->option('max-lines');
            $maxCharacters = (int) $this->option('max-characters');

            // Add a progress bar if there are heavy transforms pending.
            if ($transformCount > 0) {
                $progressBar = $this->output->createProgressBar($transformCount);
                $progressBar->start();
                Event::listen(TransformCompleteEvent::class, function ($event) use ($progressBar) {
                    // Only update the progress bar for heavy transforms.
                    if (method_exists($event->transformer, 'isHeavy') && $event->transformer->isHeavy()) {
                        $progressBar->advance();
                    }
                });
            }

            $fileOutput = $fileRenderer->render($finalFiles, $maxLines, $maxCharacters);

            if (isset($progressBar)) {
                $progressBar->finish();
                $this->line(''); // Add a new line after the progress bar.
            }
        }

        // Combine the outputs into the final XML.
        $profileNameUsed = $profileName; // The resolved profile name
        $generationTimestamp = date('c'); // ISO 8601 timestamp
        $originalSourcePath = $this->argument('path') ?: getcwd(); // The path argument given

        // Add context attributes to the root tag
        $projectAttributes = sprintf(
            ' profile="%s" source-path="%s"',
            htmlspecialchars($profileNameUsed, ENT_QUOTES, 'UTF-8'),
            htmlspecialchars($originalSourcePath, ENT_QUOTES, 'UTF-8')
        );

        $combinedOutput = "<ct:project{$projectAttributes}>\n";
        if (! $this->option('only-tree')) {
            $combinedOutput .= "<ct:project_files>\n{$fileOutput}\n</ct:project_files>\n";
        }
        $combinedOutput .= "<ct:tree>\n{$treeOutput}\n</ct:tree>\n";
        $combinedOutput .= "</ct:project><!-- END OF PROJECT -->\n\n\n";

        // Handle output options.
        if ($this->input->hasParameterOption(['--output', '-o'])) {
            $outputOption = $this->option('output') ?? '';

            if ($outputOption === '') {
                // No filename provided, use TempFileManager to store in temporary folder
                // with AI-generated descriptive filename
                $fullPath = TempFileManager::createAITempFile($combinedOutput, $finalFiles);
                $this->info("Saved output to temporary file: {$fullPath}");
                $this->revealInFinder($fullPath);
            } else {
                // Full filename provided, use it as is
                // Create the outputs folder if it does not exist.
                $outputDir = copytree_path('outputs');
                if (! is_dir($outputDir)) {
                    mkdir($outputDir, 0755, true);
                }

                $fullPath = $outputDir.DIRECTORY_SEPARATOR.$outputOption;
                file_put_contents($fullPath, $combinedOutput);
                $this->info("Saved output to file: {$fullPath}");
                $this->revealInFinder($fullPath);
            }
        } elseif ($this->option('display')) {
            // Display the output in the console.
            $this->line($combinedOutput);
        } elseif ($this->option('as-reference')) {
            // Create a temporary file and copy its reference to the clipboard.
            $tempFile = TempFileManager::createTempFile($combinedOutput);
            (new Clipboard)->copy($tempFile, true);
            $this->info("Copied reference to temporary file: {$tempFile}");
        } else {
            // Copy the output directly to the clipboard.
            (new Clipboard)->copy($combinedOutput);
            $this->info('Copied '.count($finalFiles).' files ['.ByteCounter::getFormattedTotal().'] to clipboard.');
        }

        // If in verbose mode, display information about duplicate files
        if ($this->output->isVerbose() && ! empty($duplicates)) {
            $this->info("\nDuplicate files removed:");
            foreach (array_keys($duplicates) as $duplicate) {
                $this->line("  - {$duplicate}");
            }
        }

        return self::SUCCESS;
    }

    private function revealInFinder(string $filePath): void
    {
        // Attempt to reveal the file in Finder using AppleScript.
        $script = sprintf(
            'tell application "Finder" to reveal POSIX file "%s"
            tell application "Finder" to activate',
            str_replace('"', '\"', $filePath)
        );

        $process = new Process(['osascript', '-e', $script]);
        $process->run();
    }
}
