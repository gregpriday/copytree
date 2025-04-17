<?php

namespace App\Commands;

use App\Exceptions\GitOperationException;
use App\Exceptions\InvalidGitHubUrlException;
use App\Pipeline\RulesetFilter;
use App\Profiles\ProfileGuesser;
use App\Profiles\ProfileLoader;
use App\Services\GitHubUrlHandler;
use GregPriday\GitIgnore\GitIgnoreManager;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Contracts\Console\Kernel as ArtisanContract;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use LaravelZero\Framework\Commands\Command;
use Symfony\Component\Console\Output\BufferedOutput;
use Symfony\Component\Finder\Finder;
use Symfony\Component\Process\Process;

class WatchCommand extends Command
{
    /**
     * The signature of the command.
     *
     * @var string
     */
    protected $signature = 'watch
        {path? : The directory path or GitHub URL (default: current working directory)}
        {--o|output= : Filename to overwrite on each change (defaults to a temporary file)}
        {--d|depth=10 : Maximum depth of the tree.}
        {--p|profile=auto : Profile to apply.}
        {--f|filter=* : Filter files using glob patterns.}
        {--a|ai-filter=* : Filter files using AI based on a natural language description.}
        {--m|modified : Only include files that have been modified since the last commit.}
        {--c|changes= : Filter for files changed between two commits.}
        {--order-by=default : Specify the file ordering (default|modified).}
        {--w|debounce=500 : Milliseconds to wait before regenerating after a change}';

    /**
     * The description of the command.
     *
     * @var string
     */
    protected $description = 'Watch a directory for changes and regenerate the Copytree output to a file.';

    private string $projectPath; // Store the resolved project path

    /**
     * Execute the console command.
     *
     * @return mixed
     */
    public function handle()
    {
        $pathInput = $this->argument('path') ?? getcwd();

        // Manually handle GitHub URL detection and instantiation
        try {
            if (GitHubUrlHandler::isGitHubUrl($pathInput)) {
                $this->comment("Detected GitHub URL: {$pathInput}");
                $githubUrlHandler = new GitHubUrlHandler($pathInput);
                $this->projectPath = $githubUrlHandler->getFiles();
                $this->info("Using local path for GitHub repo: {$this->projectPath}");
            } else {
                if (! is_dir($pathInput) && ! is_file($pathInput)) {
                    $this->error("Local path does not exist: {$pathInput}");

                    return self::FAILURE;
                }
                $this->projectPath = $pathInput;
            }

            if (empty($this->projectPath) || (! is_dir($this->projectPath) && ! is_file($this->projectPath))) {
                $this->error("Failed to resolve a valid project path from input: {$pathInput}");

                return self::FAILURE;
            }

        } catch (InvalidGitHubUrlException|GitOperationException $e) {
            $this->error('GitHub URL Error: '.$e->getMessage());

            return self::FAILURE;
        } catch (\Exception $e) {
            $this->error('Error processing path: '.$e->getMessage());

            return self::FAILURE;
        }

        // Determine output file path
        $outputOption = $this->option('output');
        $finalOutputFilePath = null;

        if ($outputOption !== null && $outputOption !== '') {
            // --output=filename: Use the specified filename in copytree_path('outputs')
            $outputDir = copytree_path('outputs');
            File::ensureDirectoryExists($outputDir);
            $finalOutputFilePath = $outputDir.DIRECTORY_SEPARATOR.$outputOption;
            $this->info("Output will be written to specified file: {$finalOutputFilePath}");

            // Perform initial generation *to the specified file*
            $this->info('Performing initial generation to specified file...');
            try {
                $this->regenerateOutput($finalOutputFilePath);
                $this->info(sprintf('Initial output written at %s: %s', date('H:i:s'), $finalOutputFilePath));
                // Reveal the user-specified file
                $this->revealInFinder($finalOutputFilePath);
            } catch (\Exception $e) {
                $this->error('Error writing initial output file: '.$e->getMessage());

                return self::FAILURE;
            }

        } else {
            // No --output option provided OR --output= (empty value):
            // Default to AI filename in copytree_path('outputs') by running 'copytree --output'
            $this->info("Running initial 'copytree --output' to determine AI filename and generate output...");

            $commandArray = [
                'php', 'copytree', '--output', '--no-interaction',
                // Pass relevant options from WatchCommand to the initial copy command
                '--depth', $this->option('depth'),
                '--profile', $this->option('profile'),
                '--order-by', $this->option('order-by'),
            ];
            // Add array options correctly for Process
            foreach ((array) $this->option('filter') as $filter) {
                $commandArray[] = '--filter';
                $commandArray[] = $filter;
            }
            foreach ((array) $this->option('ai-filter') as $aiFilter) {
                $commandArray[] = '--ai-filter';
                $commandArray[] = $aiFilter;
            }
            // Add boolean flags
            if ($this->option('modified')) {
                $commandArray[] = '--modified';
            }
            if ($this->option('changes')) {
                $commandArray[] = '--changes';
                $commandArray[] = $this->option('changes');
            }

            try {
                // Run from the resolved project path
                $process = new Process($commandArray, $this->projectPath);
                $process->mustRun(); // Throws exception on failure

                $output = $process->getOutput();

                // Parse the output to find the file path
                if (preg_match('/^Saved output to (?:file|temporary file): (.+)$/m', $output, $matches)) {
                    $finalOutputFilePath = trim($matches[1]);
                    $this->info("Initial generation complete. Watching will update: {$finalOutputFilePath}");
                    // Reveal is handled by the initial 'copytree --output' command itself.
                } else {
                    $this->error("Could not parse output path from initial 'copytree --output' run.");
                    $this->line('Command executed: '.implode(' ', $commandArray));
                    $this->line("Output was:\n".$output);

                    return self::FAILURE;
                }
            } catch (\Symfony\Component\Process\Exception\ProcessFailedException $e) {
                $this->error("Initial 'copytree --output' command failed:");
                $this->line('Command: '.$e->getProcess()->getCommandLine());
                $this->line('Exit Code: '.$e->getProcess()->getExitCode());
                $this->line("Error Output:\n".$e->getProcess()->getErrorOutput());
                $this->line("Standard Output:\n".$e->getProcess()->getOutput());

                return self::FAILURE;
            } catch (\Exception $e) {
                $this->error("An unexpected error occurred running initial 'copytree --output': ".$e->getMessage());

                return self::FAILURE;
            }
        }

        // --- START: Load Profile and Filters for Watching ---
        $this->info('Loading profile and ignore rules to optimize file watching...');
        $profileNameOption = $this->option('profile');
        $profileLoader = new ProfileLoader($this->projectPath);
        $profileGuesser = new ProfileGuesser($this->projectPath);
        $loadedProfileData = [];
        $watchFilter = null;
        $gitIgnoreManager = null; // Instantiate here

        try {
            // Instantiate GitIgnoreManager once
            // Ensure the namespace is correct or use \ if it's global
            $gitIgnoreManager = new GitIgnoreManager($this->projectPath, true, ['.ctreeignore']);

            $profileName = $profileNameOption === 'auto'
                ? $profileGuesser->guess()
                : $profileNameOption;
            $profilePath = $profileGuesser->getProfilePath($profileName);

            if ($profilePath) {
                // Load profile using ProfileLoader
                $profileLoader->load($profilePath, [
                    'filter' => (array) $this->option('filter'),
                ]);
                $loadedProfileData = Config::get('profile', []);
                $this->info("Watching files relevant to profile: {$profileName}");

                // Create RulesetFilter only if profile loaded successfully
                $watchFilter = new RulesetFilter(
                    $loadedProfileData['include'] ?? [],
                    $loadedProfileData['exclude'] ?? [],
                    $loadedProfileData['always'] ?? []
                );

            } else {
                $this->warn("Profile '{$profileName}' not found. Watching based on ignore files only (less efficient).");
                // No specific profile filter, rely only on GitIgnoreManager
            }
        } catch (\Exception $e) {
            $this->error('Error loading profile/ignore rules: '.$e->getMessage().'. Watching may be inaccurate or inefficient.');
            // Ensure gitIgnoreManager is initialized even on profile load error
            if (! $gitIgnoreManager) {
                try {
                    $gitIgnoreManager = new GitIgnoreManager($this->projectPath, true, ['.ctreeignore']);
                } catch (\Exception $gitEx) {
                    $this->error('Failed to initialize GitIgnoreManager: '.$gitEx->getMessage());
                    // Decide how to proceed - maybe exit? For now, watching continues without ignores.
                }
            }
        }
        // --- END: Load Profile and Filters ---

        // Watch loop
        $this->info('Starting file watcher...');
        // Pass both filter and ignore manager to the initial state calculation
        $lastState = $this->getDirectoryState($this->projectPath, $gitIgnoreManager, $watchFilter); // Pass both
        $lastChangeTime = 0;
        $needsRegeneration = false;
        $debounceMs = max(100, (int) $this->option('debounce'));

        while (true) {
            // Pass both filter and ignore manager when getting the current state
            $currentState = $this->getDirectoryState($this->projectPath, $gitIgnoreManager, $watchFilter); // Pass both
            $changeDetected = ($currentState != $lastState);

            if ($changeDetected) {
                $this->comment(sprintf('Change detected at %s', date('H:i:s')));
                $lastChangeTime = microtime(true);
                $needsRegeneration = true;
                $lastState = $currentState; // Update state immediately on detection
            }

            if ($needsRegeneration && (microtime(true) - $lastChangeTime) * 1000 > $debounceMs) {
                $this->info(sprintf('Debounce time elapsed, regenerating at %s...', date('H:i:s')));
                try {
                    // RegenerateOutput now uses the path determined earlier
                    $this->regenerateOutput($finalOutputFilePath);
                    $this->info(sprintf('Output updated at %s: %s', date('H:i:s'), $finalOutputFilePath));
                } catch (\Exception $e) {
                    $this->error('Error regenerating output: '.$e->getMessage());
                }
                $needsRegeneration = false;
            }
            usleep(100000);
        }

        return self::SUCCESS;
    }

    /**
     * Get the current state of the relevant directory files (files and modification times).
     * Filters files based on GitIgnoreManager and optional RulesetFilter.
     *
     * @param  RulesetFilter|null  $filter  Optional profile filter to apply.
     * @return array<string, int>
     */
    private function getDirectoryState(
        string $path,
        ?GitIgnoreManager $gitIgnoreManager = null,
        ?RulesetFilter $filter = null
    ): array {
        $state = [];
        try {
            $finder = new Finder;
            $finder->files()->in($path)->ignoreDotFiles(true)->ignoreVCS(true);

            // $gitIgnoreManager is now passed in, no need to instantiate here

            foreach ($finder as $file) {
                /** @var \Symfony\Component\Finder\SplFileInfo $file */

                // --- START: Apply Filtering ---
                // 1. Apply .gitignore / .ctreeignore rules FIRST
                if ($gitIgnoreManager && ! $gitIgnoreManager->accept($file)) {
                    continue; // Skip ignored files
                }

                // 2. Apply profile filter rules (if a profile filter exists)
                if ($filter && ! $filter->accept($file)) {
                    continue; // Skip files excluded by the profile
                }
                // --- END: Apply Filtering ---

                // Only add files that pass filters to the state
                $realPath = $file->getRealPath();
                if ($realPath) {
                    try {
                        // Use filemtime directly on realpath for potentially better reliability
                        $mtime = filemtime($realPath);
                        if ($mtime !== false) {
                            $state[$realPath] = $mtime;
                        } else {
                            Log::warning("WatchCommand: Could not get mtime for {$realPath} (filemtime returned false).");
                        }
                    } catch (\ErrorException $e) {
                        // Catch specific ErrorException which filemtime can throw on failure
                        Log::warning("WatchCommand: Error getting mtime for {$realPath}: ".$e->getMessage());
                    } catch (\Exception $e) {
                        // Catch broader exceptions just in case
                        Log::warning("WatchCommand: Unexpected error getting mtime for {$realPath}: ".$e->getMessage());
                    }
                } else {
                    // Log if realpath failed, might indicate symlink issues or permissions
                    Log::warning('WatchCommand: Could not get realpath for file: '.$file->getPathname());
                }
            }
        } catch (\Exception $e) {
            $this->warn('Error scanning directory state: '.$e->getMessage());
            // Return empty state or handle error as appropriate
        }
        ksort($state); // Ensure consistent order for comparison

        return $state;
    }

    /**
     * Regenerates the Copytree output by calling the main copy command and writes it to the specified file.
     *
     * @param  string  $outputFilePath  The target file path determined during initialization.
     *
     * @throws \Exception
     */
    private function regenerateOutput(string $outputFilePath): void
    {
        // Build the options array for the Artisan call, mirroring handle logic
        $copyOptions = [
            'path' => $this->projectPath,
            '--depth' => $this->option('depth'),
            '--profile' => $this->option('profile'),
            '--filter' => (array) $this->option('filter'),
            '--ai-filter' => (array) $this->option('ai-filter'),
            '--order-by' => $this->option('order-by'),
            // Force display output to capture it, avoid clipboard/file actions within copy command
            '--display' => true,
            '--no-interaction' => true,
        ];
        if ($this->option('modified')) {
            $copyOptions['--modified'] = true;
        }
        if ($this->option('changes')) {
            $copyOptions['--changes'] = $this->option('changes');
        }

        // Create a buffer to capture the output of Artisan::call
        $outputBuffer = new BufferedOutput;

        try {
            // Get the Artisan kernel instance
            $artisan = $this->laravel->make(ArtisanContract::class);

            // Call the command, passing the buffer as the output destination
            $exitCode = $artisan->call('copy', $copyOptions, $outputBuffer);

            // Fetch the captured output
            $output = $outputBuffer->fetch();

            if ($exitCode !== Command::SUCCESS) {
                $errorOutput = $output ?: 'Unknown error during copy command execution.';
                // Throw exception but don't stop the watcher necessarily
                throw new \RuntimeException("Copy command failed during regeneration (exit code {$exitCode}). Output: ".$errorOutput);
            }

            // Write the generated output to the target file
            File::put($outputFilePath, $output);

        } catch (\Exception $e) {
            // Re-throw the exception so it gets caught and logged by the main loop
            throw $e;
        }
    }

    /**
     * Reveal the specified file path in Finder (macOS only).
     */
    private function revealInFinder(string $filePath): void
    {
        if (PHP_OS_FAMILY !== 'Darwin') {
            $this->comment('File revealing is only supported on macOS.');

            return;
        }
        // Attempt to reveal the file in Finder using AppleScript.
        $script = sprintf(
            'tell application "Finder" to reveal POSIX file "%s"
            tell application "Finder" to activate',
            str_replace('"', '\"', $filePath)
        );

        try {
            $process = new Process(['osascript', '-e', $script]);
            $process->mustRun(); // Use mustRun to throw exception on error
        } catch (\Exception $e) {
            $this->warn('Could not reveal file in Finder: '.$e->getMessage());
        }
    }

    /**
     * Define the command's schedule.
     */
    public function schedule(Schedule $schedule): void
    {
        // $schedule->command(static::class)->everyMinute();
    }
}
