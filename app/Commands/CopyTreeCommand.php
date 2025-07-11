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
use App\Transforms\FileTransformer;
use App\Services\GitHubUrlHandler;
use App\Utilities\Clipboard;
use App\Utilities\TempFileManager;
use CzProject\GitPhp\Git;
use CzProject\GitPhp\GitException;
use Exception;
use Illuminate\Pipeline\Pipeline;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Log;
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
        {--no-profile : Skip profile loading entirely (useful for creating new profiles).}
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
        {--order-by=default : Specify the file ordering (default|modified).}
        {--debug : Route ALL logs to console and set level to debug for this run.}
        {--dry-run : Simulate the copy process and list files without full output.}
        {--validate : Validate the profile and exit without copying.}';

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
        // --- Start: Debug logging setup ---
        if ($this->option('debug')) {
            // Set the default driver to our console channel FOR THIS REQUEST
            Log::setDefaultDriver('console_debug');
            $this->line('<fg=yellow;options=bold>Debug mode enabled. All logs routed to console.</>');
            Log::debug('Debug mode activated via setDefaultDriver.'); // Confirmation
        } else {
            // Ensure the default driver is the standard one (e.g., 'stack')
            // This might be redundant if 'stack' is already the framework default,
            // but it makes the logic explicit.
            Log::setDefaultDriver(config('logging.default')); // Use the configured default
        }
        // --- End: Debug logging setup ---

        TempFileManager::cleanOldFiles();
        Log::debug('Old temporary files cleaned up');

        // Check for --validate flag early
        if ($this->option('validate')) {
            // Check for conflicting options
            $conflictingOptions = [];
            if ($this->option('dry-run')) $conflictingOptions[] = '--dry-run';
            if ($this->option('ai-filter')) $conflictingOptions[] = '--ai-filter';
            if ($this->option('changes')) $conflictingOptions[] = '--changes';
            if ($this->option('modified')) $conflictingOptions[] = '--modified';
            if ($this->option('output')) $conflictingOptions[] = '--output';
            if ($this->option('as-reference')) $conflictingOptions[] = '--as-reference';
            if ($this->option('display')) $conflictingOptions[] = '--display';
            if ($this->option('stream')) $conflictingOptions[] = '--stream';
            
            if (!empty($conflictingOptions)) {
                $this->error('--validate may not be used with ' . implode(', ', $conflictingOptions) . '.');
                return 2; // INVALID exit code
            }
            
            // Use the provided path argument or fallback to the current working directory.
            $projectPath = $this->argument('path') ?: getcwd();
            
            // Determine profile name
            $profileName = null;
            if (!$this->option('no-profile')) {
                try {
                    $profileGuesser = new ProfileGuesser($projectPath);
                    $profileName = $this->option('profile') === 'auto'
                        ? $profileGuesser->guess()
                        : $this->option('profile');
                } catch (Exception $e) {
                    $this->error('Profile error: '.$e->getMessage());
                    return self::FAILURE;
                }
            }
            
            // Call the profile:validate command
            if ($profileName) {
                // Change to project directory for validation
                $originalDir = getcwd();
                chdir($projectPath);
                $result = $this->call('profile:validate', ['name' => $profileName]);
                chdir($originalDir);
                return $result;
            } else {
                $this->error('No profile specified or found. Use --profile to specify a profile.');
                return self::FAILURE;
            }
        }

        // Display warning if this is not macOS
        if (PHP_OS_FAMILY !== 'Darwin') {
            $this->warn('This command is designed for macOS and may not work as expected on other operating systems.');
            Log::debug('Non-macOS OS detected', ['os' => PHP_OS_FAMILY]);
        }

        // Use the provided path argument or fallback to the current working directory.
        $projectPath = $this->argument('path') ?: getcwd();
        Log::debug('Project path resolved', ['path' => $projectPath]);

        // If the provided project path is a GitHub URL, clone the repository and use the local path.
        if (str_starts_with($projectPath, 'https://github.com/')) {
            Log::debug('GitHub URL detected', ['url' => $projectPath]);
            $handler = new GitHubUrlHandler($projectPath);
            $projectPath = $handler->getFiles();
        }

        // Only load profile if --no-profile is not set
        if (!$this->option('no-profile')) {
            try {
                // Load the profile configuration.
                $profileGuesser = new ProfileGuesser($projectPath);
                Log::debug('Profile guesser initialized', ['project_path' => $projectPath]);

                $profileName = $this->option('profile') === 'auto'
                    ? $profileGuesser->guess()
                    : $this->option('profile');
                Log::debug('Profile name determined', ['profile' => $profileName, 'auto_guessed' => $this->option('profile') === 'auto']);

                $profilePath = $profileGuesser->getProfilePath($profileName);
                Log::debug('Profile path resolved', ['profile_path' => $profilePath]);
            } catch (Exception $e) {
                Log::error('Profile error', ['message' => $e->getMessage(), 'exception' => $e]);
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
            Log::debug('Profile loaded', [
                'profile' => $this->option('profile'),
                'filters' => (array) $this->option('filter'),
                'ai_filters' => $this->option('ai-filter') !== false ? $this->option('ai-filter') : null,
            ]);
        } else {
            // When --no-profile is used, we still need to apply command-line options
            $profileLoader = new ProfileLoader($projectPath);
            $profileLoader->load(null, [
                'filter' => (array) $this->option('filter'),
                'ai_filter' => $this->option('ai-filter') !== false ? $this->option('ai-filter') : null,
                'modified' => $this->option('modified'),
                'changes' => $this->option('changes'),
                'depth' => (int) $this->option('depth'),
                'max_lines' => (int) $this->option('max-lines'),
            ]);
            Log::debug('No profile loaded (--no-profile option used)', [
                'filters' => (array) $this->option('filter'),
                'ai_filters' => $this->option('ai-filter') !== false ? $this->option('ai-filter') : null,
            ]);
        }

        // Load the initial file set.
        $depth = (int) $this->option('depth');
        $fileLoader = new FileLoader($projectPath);
        $files = $fileLoader->loadFiles($depth);
        Log::debug('Initial files loaded', ['count' => count($files), 'depth' => $depth]);

        // Track duplicate files for verbose output
        $duplicates = [];
        Event::listen(DuplicateFileFoundEvent::class, function ($event) use (&$duplicates) {
            $duplicates[$event->file->getRelativePathname()] = true;
        });

        // Build the pipeline using a Laravel Pipeline.
        $pipeline = app(Pipeline::class)->send($files);

        $isDryRun = $this->option('dry-run');  // Check the flag once

        // Add Git filtering if requested.
        if ($this->option('modified') || $this->option('changes')) {
            $pipeline->pipe([
                new GitFilterStage($projectPath, (bool) $this->option('modified'), $this->option('changes')),
            ]);
        }

        // Add AI filtering if requested, but skip in dry-run to avoid API calls.
        $aiFilters = (array) $this->option('ai-filter');
        if (!$isDryRun) {
            foreach ($aiFilters as $filterDescription) {
                $pipeline->pipe([
                    new AIFilterStage($filterDescription),
                ]);
            }
        } else if (!empty($aiFilters)) {
            Log::debug('Skipping AI filtering in dry-run mode to avoid heavy processing.');
            $this->warn('AI filters are skipped in --dry-run mode.');
        }

        // Add external sources if configured in the profile.
        if (config('profile.external')) {
            $pipeline->pipe([
                new ExternalSourceStage(config('profile.external')),
            ]);
        }

        // Apply ruleset filtering if configured.
        // Check for include/exclude rules or filter option
        $includeRules = config('profile.include', []);
        $filterRules = config('profile.filter', []);
        
        // If filter option is provided, use it as include rules
        if (!empty($filterRules) && empty($includeRules)) {
            $includeRules = $filterRules;
        }
        
        if ($includeRules || config('profile.exclude')) {
            $pipeline->pipe([
                new RulesetFilterStage(
                    new RulesetFilter(
                        $includeRules,
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

        // If dry-run, output the file list and exit early.
        if ($isDryRun) {
            if (empty($finalFiles)) {
                $this->info('No files would be included based on the current filters and profile.');
            } else {
                $this->info('Files that would be included:');
                
                // Get FileTransformer instance to check transformations
                $fileTransformer = null;
                $transforms = config('profile.transforms', []);
                
                if (!empty($transforms)) {
                    try {
                        // Create a new FileTransformer instance with current transforms
                        $fileTransformer = new FileTransformer($transforms);
                    } catch (\Exception $e) {
                        // If we can't get the transformer, continue without transformation info
                        Log::debug('Could not instantiate FileTransformer in dry-run mode', ['error' => $e->getMessage()]);
                    }
                }
                
                // Prepare file information and check for transformers
                $fileInfos = [];
                $transformerMap = [];
                
                foreach ($finalFiles as $file) {
                    $path = $file->getRelativePathname();
                    $size = $this->formatFileSize($file->getSize());
                    
                    $fileInfos[] = [
                        'path' => $path,
                        'size' => $size,
                    ];
                    
                    // Check if file would be transformed
                    if ($fileTransformer) {
                        $transformer = $fileTransformer->getTransformerForFile($file);
                        if ($transformer) {
                            if (!isset($transformerMap[$transformer])) {
                                $transformerMap[$transformer] = [];
                            }
                            $transformerMap[$transformer][] = $path;
                        }
                    }
                }
                
                // Sort by path for consistent output
                usort($fileInfos, function ($a, $b) {
                    return strcmp($a['path'], $b['path']);
                });
                
                // Output file information
                foreach ($fileInfos as $info) {
                    $line = $info['path'] . ' [' . $info['size'] . ']';
                    $this->line($line);
                }
                
                $this->info("\nTotal files: " . count($finalFiles));
                
                // Show transformer information if any
                if (!empty($transformerMap)) {
                    $this->info("\nTransformations that would be applied:");
                    foreach ($transformerMap as $transformer => $files) {
                        $this->info("  " . $transformer . ":");
                        foreach ($files as $file) {
                            $this->line("    - " . $file);
                        }
                    }
                }
            }
            return self::SUCCESS;  // Exit early
        }

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
            Log::debug('Output file option detected', ['output_path' => $outputOption]);

            if ($outputOption === '') {
                // No filename provided, use TempFileManager to store in temporary folder
                // with AI-generated descriptive filename
                $fullPath = TempFileManager::createAITempFile($combinedOutput, $finalFiles);
                Log::debug('Created AI temp file', ['path' => $fullPath]);
                $this->info("Saved output to temporary file: {$fullPath}");
                $this->revealInFinder($fullPath);
            } else {
                // Full filename provided, use it as is
                // Create the outputs folder if it does not exist.
                $outputDir = copytree_path('outputs');
                if (! is_dir($outputDir)) {
                    mkdir($outputDir, 0755, true);
                    Log::debug('Created outputs directory', ['path' => $outputDir]);
                }

                $fullPath = $outputDir.DIRECTORY_SEPARATOR.$outputOption;
                file_put_contents($fullPath, $combinedOutput);
                Log::debug('Saved output to file', ['path' => $fullPath, 'size' => strlen($combinedOutput)]);
                $this->info("Saved output to file: {$fullPath}");
                $this->revealInFinder($fullPath);
            }
        } elseif ($this->option('display')) {
            // Display the output in the console.
            Log::debug('Displaying output in console', ['size' => strlen($combinedOutput)]);
            $this->line($combinedOutput);
        } elseif ($this->option('as-reference')) {
            // Create a temporary file and copy its reference to the clipboard.
            $tempFile = TempFileManager::createTempFile($combinedOutput);
            (new Clipboard)->copy($tempFile, true);
            
            // Get just the filename and file size
            $filename = basename($tempFile);
            $fileSize = $this->formatFileSize(filesize($tempFile));
            
            Log::debug('Copied reference to clipboard', ['temp_file' => $tempFile]);
            $this->info("Copied reference to temporary file: {$filename} [{$fileSize}]");
        } else {
            // Copy the output directly to the clipboard.
            (new Clipboard)->copy($combinedOutput);
            Log::debug('Copied output to clipboard', [
                'file_count' => count($finalFiles),
                'total_size' => ByteCounter::getFormattedTotal(),
            ]);
            $this->info('Copied '.count($finalFiles).' files ['.ByteCounter::getFormattedTotal().'] to clipboard.');
        }

        // If in verbose mode, display information about duplicate files
        if ($this->output->isVerbose() && ! empty($duplicates)) {
            $this->info("\nDuplicate files removed:");
            foreach (array_keys($duplicates) as $duplicate) {
                $this->line("  - {$duplicate}");
            }
        }

        // End of handle method
        Log::debug('Command execution completed successfully');

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

        if ($this->option('debug')) {
            Log::debug('Revealed file in Finder', ['path' => $filePath]);
        }
    }

    /**
     * Format file size in human-readable format.
     *
     * @param  int  $bytes  The file size in bytes.
     * @return string The formatted file size.
     */
    private function formatFileSize(int $bytes): string
    {
        if ($bytes < 1024) {
            return $bytes . ' B';
        } elseif ($bytes < 1048576) {
            return round($bytes / 1024, 1) . ' KB';
        } elseif ($bytes < 1073741824) {
            return round($bytes / 1048576, 1) . ' MB';
        } else {
            return round($bytes / 1073741824, 1) . ' GB';
        }
    }
}
