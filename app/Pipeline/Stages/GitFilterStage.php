<?php

namespace App\Pipeline\Stages;

use App\Pipeline\FilePipelineStageInterface;
use App\Utilities\Git\GitStatusChecker;
use RuntimeException;
use Symfony\Component\Finder\SplFileInfo;

class GitFilterStage implements FilePipelineStageInterface
{
    protected bool $modified;

    protected ?string $changes;

    protected ?GitStatusChecker $gitStatusChecker = null;

    /**
     * Create a new GitFilterStage.
     *
     * @param  string  $basePath  The repository root path.
     * @param  bool  $modified  Whether to filter for files modified since the last commit.
     * @param  string|null  $changes  A string in the format "commit1:commit2" to filter for files changed between two commits.
     * @param  GitStatusChecker|null  $gitStatusChecker  Optional GitStatusChecker instance for testing.
     *
     * @throws RuntimeException If both modified and changes options are provided.
     */
    public function __construct(
        string $basePath,
        bool $modified = false,
        ?string $changes = null,
        ?GitStatusChecker $gitStatusChecker = null
    ) {
        $this->modified = $modified;
        $this->changes = $changes;

        if ($this->modified && $this->changes !== null) {
            throw new RuntimeException('The "modified" and "changes" options cannot be used together.');
        }

        if ($this->shouldFilter()) {
            $this->gitStatusChecker = $gitStatusChecker ?? new GitStatusChecker();
            $this->gitStatusChecker->initRepository($basePath);
        }
    }

    /**
     * Process the incoming file collection.
     *
     * If either the "modified" or "changes" option is active, this stage uses the GitStatusChecker
     * to retrieve the list of files (relative paths) that have changed. It then filters the incoming
     * files (which must be relative to the repository root) to only include those files.
     *
     * @param  array  $files  An array of Symfony Finder SplFileInfo objects.
     * @param  \Closure  $next  The next stage in the pipeline.
     * @return array The filtered array of files.
     */
    public function handle(array $files, \Closure $next): array
    {
        if (! $this->shouldFilter()) {
            return $next($files);
        }

        $relevantFiles = $this->getRelevantFiles();

        if (empty($relevantFiles)) {
            return $next([]);
        }

        $relevantFilesLookup = array_flip($relevantFiles);

        $filteredFiles = array_filter($files, function (SplFileInfo $file) use ($relevantFilesLookup) {
            return isset($relevantFilesLookup[$file->getRelativePathname()]);
        });

        return $next(array_values($filteredFiles));
    }

    /**
     * Determines if Git filtering should be applied.
     *
     * @return bool
     */
    protected function shouldFilter(): bool
    {
        return $this->modified || $this->changes !== null;
    }

    /**
     * Retrieves the list of relevant files based on the configured options.
     *
     * @return array
     */
    protected function getRelevantFiles(): array
    {
        if ($this->modified) {
            return $this->gitStatusChecker->getModifiedFiles();
        }

        if ($this->changes !== null) {
            [$fromCommit, $toCommit] = $this->parseChangesOption();

            return $this->gitStatusChecker->getChangedFilesBetweenCommits($fromCommit, $toCommit);
        }

        return [];
    }

    /**
     * Parses the "changes" option string into from and to commits.
     *
     * @return array An array containing the from and to commit references.
     *
     * @throws RuntimeException If the format is invalid.
     */
    protected function parseChangesOption(): array
    {
        $parts = explode(':', $this->changes, 2);
        $fromCommit = $parts[0];
        $toCommit = $parts[1] ?? 'HEAD';

        if (empty($fromCommit)) {
            throw new RuntimeException('Invalid "changes" option format. "commit1" cannot be empty. Expected "commit1:commit2".');
        }

        return [$fromCommit, $toCommit];
    }
}