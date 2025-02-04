<?php

namespace App\Pipeline\Stages;

use App\Pipeline\FilePipelineStageInterface;
use App\Utilities\Git\GitStatusChecker;
use Symfony\Component\Finder\SplFileInfo;
use RuntimeException;

class GitFilterStage implements FilePipelineStageInterface
{
    protected string $basePath;
    protected bool $modified;
    protected ?string $changes;
    protected ?GitStatusChecker $gitStatusChecker = null;
    protected array $relevantFiles = [];

    /**
     * Create a new GitFilterStage.
     *
     * @param string      $basePath  The repository root path.
     * @param bool        $modified  Whether to filter for files modified since the last commit.
     * @param string|null $changes   A string in the format "commit1:commit2" to filter for files changed between two commits.
     *
     * @throws RuntimeException If both modified and changes options are provided.
     */
    public function __construct(string $basePath, bool $modified = false, ?string $changes = null)
    {
        $this->basePath = $basePath;
        $this->modified = $modified;
        $this->changes = $changes;

        if ($this->modified && $this->changes !== null) {
            throw new RuntimeException('The "modified" and "changes" options cannot be used together.');
        }

        // Only initialize the Git status checker if filtering is requested.
        if ($this->modified || $this->changes !== null) {
            $this->gitStatusChecker = new GitStatusChecker();
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
     * @param array    $files An array of Symfony Finder SplFileInfo objects.
     * @param \Closure $next  The next stage in the pipeline.
     *
     * @return array The filtered array of files.
     */
    public function handle(array $files, \Closure $next): array
    {
        // If no Git filtering is requested, simply pass along the files.
        if (!$this->modified && $this->changes === null) {
            return $next($files);
        }

        // Retrieve relevant file paths from Git.
        if ($this->modified) {
            // Get files modified since the last commit.
            $this->relevantFiles = $this->gitStatusChecker->getModifiedFiles();
        } elseif ($this->changes !== null) {
            // Expect the changes option to be in the format "commit1:commit2"
            $parts = explode(':', $this->changes);
            if (count($parts) < 1) {
                throw new RuntimeException('Invalid "changes" option format. Expected "commit1:commit2".');
            }
            $fromCommit = $parts[0];
            $toCommit = $parts[1] ?? 'HEAD';
            $this->relevantFiles = $this->gitStatusChecker->getChangedFilesBetweenCommits($fromCommit, $toCommit);
        }

        // Filter the files: we assume each file's relative path (via getRelativePathname())
        // is relative to the repository root.
        $filteredFiles = array_filter($files, function (SplFileInfo $file) {
            $relativePath = $file->getRelativePathname();
            return in_array($relativePath, $this->relevantFiles);
        });

        return $next(array_values($filteredFiles));
    }
}
