<?php

namespace App\Services;

use App\Exceptions\GitOperationException;
use App\Exceptions\InvalidGitHubUrlException;
use Illuminate\Support\Facades\Log;
use Symfony\Component\Process\Exception\ProcessFailedException;
use Symfony\Component\Process\Exception\RuntimeException as ProcessRuntimeException;
use Symfony\Component\Process\Process;

class GitHubUrlHandler
{
    protected string $repoUrl;

    protected string $branch;

    protected string $subPath;

    protected string $repoDir;

    protected string $cacheKey;

    protected string $url;

    /**
     * Tracks whether the repository was cloned or updated
     */
    protected string $repoAction = 'cloned';

    /**
     * Create a new GitHubUrlHandler instance.
     *
     * @param  string  $url  The GitHub URL in the format:
     *                       https://github.com/username/repo[/tree/branch[/sub/path]]
     *
     * @throws GitOperationException if the OS is not MacOS.
     */
    public function __construct(string $url)
    {
        if (PHP_OS_FAMILY !== 'Darwin') {
            throw new GitOperationException('This package only supports MacOS.');
        }

        $this->url = $url;

        try {
            $this->parseUrl($url);
            $this->setupCacheDirectory();
        } catch (InvalidGitHubUrlException $e) {
            Log::error('Invalid GitHub URL: '.$url, ['exception' => $e]);
            throw $e;
        } catch (\Exception $e) {
            Log::error('Error initializing GitHubUrlHandler: '.$e->getMessage(), [
                'url' => $url,
                'exception' => get_class($e),
            ]);
            throw new GitOperationException('Error initializing GitHub URL handler: '.$e->getMessage(), 0, $e);
        }
    }

    /**
     * Parse the GitHub URL into its components.
     *
     * Sets the repository URL, branch, subpath, and a cache key.
     *
     * @throws InvalidGitHubUrlException if the URL format is invalid.
     */
    protected function parseUrl(string $url): void
    {
        $pattern = '#^https://github\.com/([^/]+/[^/]+)(?:/tree/([^/]+))?(?:/(.*?)/?)?$#';
        if (! preg_match($pattern, $url, $matches)) {
            throw new InvalidGitHubUrlException('Invalid GitHub URL format');
        }

        // e.g. "username/repo" becomes a Git URL.
        $this->repoUrl = 'https://github.com/'.$matches[1].'.git';
        $this->branch = $matches[2] ?? '';
        $this->subPath = isset($matches[3]) ? rtrim($matches[3], '/') : '';

        // We'll generate the cache key after potentially detecting the default branch
        $this->updateCacheKey();

        Log::debug('Parsed GitHub URL components', [
            'url' => $url,
            'repoUrl' => $this->repoUrl,
            'branch' => $this->branch,
            'subPath' => $this->subPath,
            'cacheKey' => $this->cacheKey,
        ]);
    }

    /**
     * Update the cache key based on current repo and branch information.
     */
    protected function updateCacheKey(): void
    {
        $repoIdentifier = substr($this->repoUrl, 0, -4); // Remove the trailing .git
        $repoIdentifier = str_replace('https://github.com/', '', $repoIdentifier);
        $this->cacheKey = md5($repoIdentifier.'/'.($this->branch ?: 'default'));
    }

    /**
     * Set up the cache directory for storing cloned repositories.
     *
     * Uses ~/.copytree/cache/repos for a consistent cache location.
     *
     * @throws GitOperationException if the repos directory cannot be created.
     */
    protected function setupCacheDirectory(): void
    {
        $reposDir = copytree_path('repos');

        if (! is_dir($reposDir) && ! mkdir($reposDir, 0777, true) && ! is_dir($reposDir)) {
            throw new GitOperationException("Failed to create cache directory: {$reposDir}");
        }

        $this->repoDir = $reposDir.DIRECTORY_SEPARATOR.$this->cacheKey;
    }

    /**
     * Get the repository files.
     *
     * Clones the repository into the cache if needed, or updates it if it already exists.
     * If a subpath was specified in the URL, that subdirectory is returned.
     *
     * @return string The local file path to the repository (or subdirectory).
     *
     * @throws InvalidGitHubUrlException if the specified subPath is not found.
     */
    public function getFiles(): string
    {
        $this->ensureGitIsInstalled();

        $wasCloned = ! is_dir($this->repoDir);

        if ($wasCloned) {
            $this->cloneRepository();
        } else {
            $this->updateRepository();
        }

        $targetPath = $this->repoDir;
        if ($this->subPath) {
            $targetPath .= DIRECTORY_SEPARATOR.$this->subPath;
            if (! is_dir($targetPath)) {
                Log::error('Specified path not found in repository', [
                    'subPath' => $this->subPath,
                    'repository' => $this->repoUrl,
                    'branch' => $this->branch,
                ]);
                throw new InvalidGitHubUrlException("Specified path '{$this->subPath}' not found in repository");
            }
        }

        Log::debug("GitHub repository {$this->repoAction}", ['local_path' => $targetPath]);

        return $targetPath;
    }

    /**
     * Check if a URL is a valid GitHub URL.
     */
    public static function isGitHubUrl(string $url): bool
    {
        return str_starts_with($url, 'https://github.com/');
    }

    /**
     * Ensure Git is installed on the system.
     *
     * @throws GitOperationException if Git is not installed.
     */
    protected function ensureGitIsInstalled(): void
    {
        try {
            $this->executeCommand(['git', '--version']);
        } catch (ProcessFailedException $e) {
            Log::error('Git is not installed on this system', ['exception' => $e]);
            throw new GitOperationException('Git is not installed on this system');
        }
    }

    /**
     * Clone the repository into the cache directory.
     *
     * @throws GitOperationException if cloning fails.
     */
    protected function cloneRepository(): void
    {
        // If branch is empty, detect the default branch
        if (empty($this->branch)) {
            $this->branch = $this->detectDefaultBranch();
            // Update the cache key with the detected branch
            $this->updateCacheKey();
            // Update the repo directory with the new cache key
            $this->setupCacheDirectory();

            Log::debug('Updated cache key after branch detection', [
                'branch' => $this->branch,
                'cacheKey' => $this->cacheKey,
                'repoDir' => $this->repoDir,
            ]);
        }

        // Check if the repo directory already exists and is not empty
        if (is_dir($this->repoDir) && count(scandir($this->repoDir)) > 2) {
            Log::debug('Repository directory already exists, updating instead of cloning', [
                'repoDir' => $this->repoDir,
            ]);
            // The directory exists and isn't empty, so update instead of cloning
            $this->updateRepository();

            return;
        }

        $this->repoAction = 'cloned';

        Log::debug('Attempting git clone command', [
            'repoUrl' => $this->repoUrl,
            'branch' => $this->branch,
            'repoDir' => $this->repoDir,
        ]);

        $command = [
            'git', 'clone',
            '--branch', $this->branch,
            '--single-branch',
            $this->repoUrl,
            $this->repoDir,
        ];

        try {
            $this->executeCommand($command);
        } catch (GitOperationException $e) {
            if (is_dir($this->repoDir)) {
                $this->executeCommand(['rm', '-rf', $this->repoDir]);
            }

            // Check for specific error patterns and provide better error messages
            $message = $e->getMessage();
            if (strpos($message, 'Authentication failed') !== false) {
                Log::error('Authentication failed while cloning repository', [
                    'repoUrl' => $this->repoUrl,
                    'exception' => $e,
                ]);
                throw new GitOperationException('Authentication failed for repository. Please check your credentials.', 0, $e);
            } elseif (strpos($message, 'not found') !== false || strpos($message, '404') !== false) {
                Log::error('Repository not found', [
                    'repoUrl' => $this->repoUrl,
                    'exception' => $e,
                ]);
                throw new GitOperationException("Repository not found: {$this->repoUrl}. Please check the URL and make sure the repository exists and is accessible.", 0, $e);
            } elseif (strpos($message, 'Remote branch') !== false && strpos($message, 'not found') !== false) {
                // Handle the case where the branch wasn't found
                Log::warning('Specified branch not found, trying clone without branch specification', [
                    'branch' => $this->branch,
                    'repoUrl' => $this->repoUrl,
                ]);

                // Try again without specifying a branch
                $simpleCommand = [
                    'git', 'clone',
                    $this->repoUrl,
                    $this->repoDir,
                ];

                try {
                    $this->executeCommand($simpleCommand);

                    // After cloning, find out what branch we're on
                    $branchProcess = $this->executeCommand(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], $this->repoDir);
                    $this->branch = trim($branchProcess->getOutput());

                    Log::debug('Repository cloned successfully without branch specification', [
                        'actualBranch' => $this->branch,
                        'repoUrl' => $this->repoUrl,
                    ]);

                    return;
                } catch (GitOperationException $innerException) {
                    // If that also fails, clean up and re-throw the original exception
                    if (is_dir($this->repoDir)) {
                        $this->executeCommand(['rm', '-rf', $this->repoDir]);
                    }
                    throw $e;
                }
            }

            // Re-throw with original message for other cases
            throw $e;
        }
    }

    /**
     * Update the repository if it already exists.
     *
     * If the local branch is behind, this method resets and pulls updates.
     */
    protected function updateRepository(): void
    {
        try {
            // Check if the repo directory is a valid git repository
            if (! is_dir($this->repoDir.'/.git')) {
                Log::warning('Repository directory exists but is not a valid git repository, re-cloning', [
                    'repoDir' => $this->repoDir,
                ]);
                $this->executeCommand(['rm', '-rf', $this->repoDir]);
                $this->cloneRepository();

                return;
            }

            $this->repoAction = 'updated';

            // Try to fetch, but handle 'not found' errors that might indicate repository was renamed or deleted
            try {
                $this->executeCommand(['git', 'fetch'], $this->repoDir);
            } catch (GitOperationException $e) {
                // Check if this is a "repository not found" error
                if (strpos($e->getMessage(), 'not found') !== false ||
                    strpos($e->getMessage(), '404') !== false) {
                    Log::warning('Repository not found during fetch, possibly renamed or deleted. Re-cloning.', [
                        'repoUrl' => $this->repoUrl,
                        'error' => $e->getMessage(),
                    ]);
                    $this->executeCommand(['rm', '-rf', $this->repoDir]);
                    $this->cloneRepository();

                    return;
                }
                // Re-throw other exceptions
                throw $e;
            }

            // If branch was empty, check if we need to detect it
            if (empty($this->branch)) {
                $this->branch = $this->detectDefaultBranch();
                Log::debug('Detected default branch for update', [
                    'branch' => $this->branch,
                    'repoUrl' => $this->repoUrl,
                ]);
            }

            // Try to get behind count, but handle potential errors
            try {
                $behindCountProcess = $this->executeCommand(
                    ['git', 'rev-list', 'HEAD..origin/'.$this->branch, '--count'],
                    $this->repoDir
                );
                $behindCount = (int) trim($behindCountProcess->getOutput());
            } catch (GitOperationException $e) {
                Log::warning('Failed to check if repository is behind remote, assuming update needed', [
                    'branch' => $this->branch,
                    'error' => $e->getMessage(),
                ]);
                // If we couldn't get the behind count, force an update
                $behindCount = 1;
            }

            if ($behindCount > 0) {
                Log::debug('Repository is behind remote', [
                    'behindCount' => $behindCount,
                    'branch' => $this->branch,
                ]);

                // Reset and clean, but don't fail if these steps have issues
                try {
                    $this->executeCommand(['git', 'reset', '--hard', 'HEAD'], $this->repoDir);
                } catch (GitOperationException $e) {
                    Log::warning('Failed to reset repository, continuing with pull', [
                        'error' => $e->getMessage(),
                    ]);
                }

                try {
                    $this->executeCommand(['git', 'clean', '-fd'], $this->repoDir);
                } catch (GitOperationException $e) {
                    Log::warning('Failed to clean repository, continuing with pull', [
                        'error' => $e->getMessage(),
                    ]);
                }

                // Pull the latest changes
                $this->executeCommand(['git', 'pull', 'origin', $this->branch], $this->repoDir);
            } else {
                Log::debug('Repository is up to date with remote', [
                    'branch' => $this->branch,
                ]);
            }
        } catch (GitOperationException $e) {
            Log::warning('Failed to update repository, attempting full re-clone', [
                'repoUrl' => $this->repoUrl,
                'branch' => $this->branch,
                'exception' => $e,
            ]);
            $this->executeCommand(['rm', '-rf', $this->repoDir]);
            $this->cloneRepository();
        }
    }

    /**
     * Execute a system command using Symfony Process.
     *
     * @param  array  $command  The command to execute.
     * @param  string|null  $cwd  The working directory (if any).
     * @return Process The executed process.
     *
     * @throws GitOperationException if the process fails.
     */
    protected function executeCommand(array $command, ?string $cwd = null): Process
    {
        $process = new Process($command, $cwd);

        try {
            $process->run();

            if (! $process->isSuccessful()) {
                $errorOutput = $process->getErrorOutput();
                $stdOutput = $process->getOutput();
                Log::error('Git command failed', [
                    'command' => implode(' ', $command),
                    'cwd' => $cwd,
                    'errorOutput' => $errorOutput,
                    'stdOutput' => $stdOutput,
                    'exitCode' => $process->getExitCode(),
                ]);
                throw new GitOperationException('Git command failed: '.$errorOutput);
            }

            return $process;
        } catch (ProcessFailedException $e) {
            Log::error('Process execution failed', [
                'command' => implode(' ', $command),
                'cwd' => $cwd,
                'errorOutput' => $process->getErrorOutput(),
                'stdOutput' => $process->getOutput(),
                'exception' => $e,
            ]);
            throw new GitOperationException('Git command failed: '.$e->getMessage(), 0, $e);
        } catch (ProcessRuntimeException $e) {
            Log::error('Process runtime error', [
                'command' => implode(' ', $command),
                'cwd' => $cwd,
                'exception' => $e,
            ]);
            throw new GitOperationException('Git command runtime error: '.$e->getMessage(), 0, $e);
        } catch (\Exception $e) {
            Log::error('Unexpected error executing command', [
                'command' => implode(' ', $command),
                'cwd' => $cwd,
                'exception' => get_class($e),
            ]);
            throw new GitOperationException('Unexpected error executing Git command: '.$e->getMessage(), 0, $e);
        }
    }

    /**
     * Clean the entire GitHub cache.
     *
     * This removes the entire cache directory.
     *
     * @throws GitOperationException if the clean operation fails.
     */
    public static function cleanCache(): void
    {
        try {
            $reposDir = copytree_path('repos');

            if (is_dir($reposDir)) {
                $process = new Process(['rm', '-rf', $reposDir]);
                $process->run();

                if (! $process->isSuccessful()) {
                    throw new ProcessFailedException($process);
                }
            }
        } catch (\Exception $e) {
            Log::error('Failed to clean repos directory', [
                'reposDir' => $reposDir ?? 'undefined',
                'exception' => get_class($e),
            ]);
            throw new GitOperationException('Failed to clean repos directory: '.$e->getMessage(), 0, $e);
        }
    }

    /**
     * Clean up this specific repository cache.
     *
     * Removes the cached repository directory.
     *
     * @throws GitOperationException if the cleanup fails.
     */
    public function cleanup(): void
    {
        if (is_dir($this->repoDir)) {
            try {
                $process = new Process(['rm', '-rf', $this->repoDir]);
                $process->run();

                if (! $process->isSuccessful()) {
                    throw new ProcessFailedException($process);
                }
            } catch (\Exception $e) {
                Log::error('Failed to clean repository directory', [
                    'repoDir' => $this->repoDir,
                    'exception' => get_class($e),
                ]);
                throw new GitOperationException('Failed to clean repository directory: '.$e->getMessage(), 0, $e);
            }
        }
    }

    /**
     * Detect the default branch of a repository.
     *
     * @return string The default branch name (e.g., 'main', 'master')
     *
     * @throws GitOperationException if the command fails
     */
    protected function detectDefaultBranch(): string
    {
        try {
            $process = $this->executeCommand(['git', 'ls-remote', '--symref', $this->repoUrl, 'HEAD']);
            $output = $process->getOutput();

            // Parse the output to find the line like "ref: refs/heads/main HEAD"
            if (preg_match('#ref: refs/heads/([^\s]+)\s+HEAD#', $output, $matches)) {
                $defaultBranch = $matches[1];
                Log::debug('Detected default branch', ['branch' => $defaultBranch, 'repoUrl' => $this->repoUrl]);

                return $defaultBranch;
            }

            // Fallback to common default branches if detection fails
            Log::warning('Could not detect default branch, using fallback', ['repoUrl' => $this->repoUrl]);

            return 'main';
        } catch (GitOperationException $e) {
            Log::warning('Failed to detect default branch, using fallback', [
                'repoUrl' => $this->repoUrl,
                'exception' => $e,
            ]);

            return 'main';
        }
    }
}
