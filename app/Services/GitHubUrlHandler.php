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
            Log::error('Invalid GitHub URL: ' . $url, ['exception' => $e]);
            throw $e;
        } catch (\Exception $e) {
            Log::error('Error initializing GitHubUrlHandler: ' . $e->getMessage(), [
                'url' => $url,
                'exception' => get_class($e)
            ]);
            throw new GitOperationException('Error initializing GitHub URL handler: ' . $e->getMessage(), 0, $e);
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
        $pattern = '#^https://github\.com/([^/]+/[^/]+)(?:/tree/([^/]+))?(?:/(.+))?$#';
        if (! preg_match($pattern, $url, $matches)) {
            throw new InvalidGitHubUrlException('Invalid GitHub URL format');
        }

        // e.g. "username/repo" becomes a Git URL.
        $this->repoUrl = 'https://github.com/'.$matches[1].'.git';
        $this->branch = $matches[2] ?? 'main';
        $this->subPath = $matches[3] ?? '';
        $this->cacheKey = md5($matches[1].'/'.$this->branch);
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

        if (! is_dir($this->repoDir)) {
            $this->cloneRepository();
        } else {
            $this->updateRepository();
        }

        $targetPath = $this->repoDir;
        if ($this->subPath) {
            $targetPath .= DIRECTORY_SEPARATOR.$this->subPath;
            if (! is_dir($targetPath)) {
                Log::error("Specified path not found in repository", [
                    'subPath' => $this->subPath,
                    'repository' => $this->repoUrl,
                    'branch' => $this->branch
                ]);
                throw new InvalidGitHubUrlException("Specified path '{$this->subPath}' not found in repository");
            }
        }

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
                    'exception' => $e
                ]);
                throw new GitOperationException('Authentication failed for repository. Please check your credentials.', 0, $e);
            } elseif (strpos($message, 'not found') !== false || strpos($message, '404') !== false) {
                Log::error('Repository not found', [
                    'repoUrl' => $this->repoUrl,
                    'exception' => $e
                ]);
                throw new GitOperationException("Repository not found: {$this->repoUrl}. Please check the URL and make sure the repository exists and is accessible.", 0, $e);
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
            $this->executeCommand(['git', 'fetch'], $this->repoDir);

            $behindCountProcess = $this->executeCommand(
                ['git', 'rev-list', 'HEAD..origin/'.$this->branch, '--count'],
                $this->repoDir
            );
            $behindCount = (int) trim($behindCountProcess->getOutput());

            if ($behindCount > 0) {
                $this->executeCommand(['git', 'reset', '--hard', 'HEAD'], $this->repoDir);
                $this->executeCommand(['git', 'clean', '-fd'], $this->repoDir);
                $this->executeCommand(['git', 'pull', 'origin', $this->branch], $this->repoDir);
            }
        } catch (GitOperationException $e) {
            Log::warning('Failed to update repository, attempting full re-clone', [
                'repoUrl' => $this->repoUrl,
                'branch' => $this->branch,
                'exception' => $e
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
                Log::error('Git command failed', [
                    'command' => implode(' ', $command),
                    'cwd' => $cwd,
                    'errorOutput' => $errorOutput,
                    'exitCode' => $process->getExitCode()
                ]);
                throw new GitOperationException('Git command failed: ' . $errorOutput);
            }

            return $process;
        } catch (ProcessFailedException $e) {
            Log::error('Process execution failed', [
                'command' => implode(' ', $command),
                'cwd' => $cwd,
                'errorOutput' => $process->getErrorOutput(),
                'exception' => $e
            ]);
            throw new GitOperationException('Git command failed: ' . $e->getMessage(), 0, $e);
        } catch (ProcessRuntimeException $e) {
            Log::error('Process runtime error', [
                'command' => implode(' ', $command),
                'cwd' => $cwd,
                'exception' => $e
            ]);
            throw new GitOperationException('Git command runtime error: ' . $e->getMessage(), 0, $e);
        } catch (\Exception $e) {
            Log::error('Unexpected error executing command', [
                'command' => implode(' ', $command),
                'cwd' => $cwd,
                'exception' => get_class($e)
            ]);
            throw new GitOperationException('Unexpected error executing Git command: ' . $e->getMessage(), 0, $e);
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
        $homeDir = getenv('HOME');
        $cacheDir = $homeDir.DIRECTORY_SEPARATOR.'.copytree'.DIRECTORY_SEPARATOR.'cache';

        if (is_dir($cacheDir)) {
            try {
                $process = new Process(['rm', '-rf', $cacheDir]);
                $process->run();

                if (! $process->isSuccessful()) {
                    throw new ProcessFailedException($process);
                }
            } catch (\Exception $e) {
                Log::error('Failed to clean cache directory', [
                    'cacheDir' => $cacheDir,
                    'exception' => get_class($e)
                ]);
                throw new GitOperationException('Failed to clean cache directory: ' . $e->getMessage(), 0, $e);
            }
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
                    'exception' => get_class($e)
                ]);
                throw new GitOperationException('Failed to clean repository directory: ' . $e->getMessage(), 0, $e);
            }
        }
    }
}
