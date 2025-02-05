<?php

namespace App\Services;

use InvalidArgumentException;
use RuntimeException;
use Symfony\Component\Process\Exception\ProcessFailedException;
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
     * @throws RuntimeException if the OS is not MacOS or if the URL format is invalid.
     */
    public function __construct(string $url)
    {
        if (PHP_OS_FAMILY !== 'Darwin') {
            throw new RuntimeException('This package only supports MacOS.');
        }

        $this->url = $url;
        $this->parseUrl($url);
        $this->setupCacheDirectory();
    }

    /**
     * Parse the GitHub URL into its components.
     *
     * Sets the repository URL, branch, subpath, and a cache key.
     *
     * @throws InvalidArgumentException if the URL format is invalid.
     */
    protected function parseUrl(string $url): void
    {
        $pattern = '#^https://github\.com/([^/]+/[^/]+)(?:/tree/([^/]+))?(?:/(.+))?$#';
        if (! preg_match($pattern, $url, $matches)) {
            throw new InvalidArgumentException('Invalid GitHub URL format');
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
     * @throws RuntimeException if the repos directory cannot be created.
     */
    protected function setupCacheDirectory(): void
    {
        $reposDir = copytree_path('repos');

        if (! is_dir($reposDir) && ! mkdir($reposDir, 0777, true) && ! is_dir($reposDir)) {
            throw new RuntimeException("Failed to create cache directory: {$reposDir}");
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
     * @throws InvalidArgumentException if the specified subPath is not found.
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
                throw new InvalidArgumentException("Specified path '{$this->subPath}' not found in repository");
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
     * @throws RuntimeException if Git is not installed.
     */
    protected function ensureGitIsInstalled(): void
    {
        try {
            $this->executeCommand(['git', '--version']);
        } catch (ProcessFailedException $e) {
            throw new RuntimeException('Git is not installed on this system');
        }
    }

    /**
     * Clone the repository into the cache directory.
     *
     * @throws RuntimeException if cloning fails.
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
        } catch (ProcessFailedException $e) {
            if (is_dir($this->repoDir)) {
                $this->executeCommand(['rm', '-rf', $this->repoDir]);
            }
            throw new RuntimeException('Failed to clone repository: '.$e->getMessage());
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
        } catch (ProcessFailedException $e) {
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
     * @throws ProcessFailedException if the process fails.
     */
    protected function executeCommand(array $command, ?string $cwd = null): Process
    {
        $process = new Process($command, $cwd);
        $process->run();

        if (! $process->isSuccessful()) {
            throw new ProcessFailedException($process);
        }

        return $process;
    }

    /**
     * Clean the entire GitHub cache.
     *
     * This removes the entire cache directory.
     *
     * @throws ProcessFailedException if the clean operation fails.
     */
    public static function cleanCache(): void
    {
        $homeDir = getenv('HOME');
        $cacheDir = $homeDir.DIRECTORY_SEPARATOR.'.copytree'.DIRECTORY_SEPARATOR.'cache';

        if (is_dir($cacheDir)) {
            $process = new Process(['rm', '-rf', $cacheDir]);
            $process->run();

            if (! $process->isSuccessful()) {
                throw new ProcessFailedException($process);
            }
        }
    }

    /**
     * Clean up this specific repository cache.
     *
     * Removes the cached repository directory.
     *
     * @throws ProcessFailedException if the cleanup fails.
     */
    public function cleanup(): void
    {
        if (is_dir($this->repoDir)) {
            $process = new Process(['rm', '-rf', $this->repoDir]);
            $process->run();

            if (! $process->isSuccessful()) {
                throw new ProcessFailedException($process);
            }
        }
    }
}
