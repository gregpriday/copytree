<?php

namespace App\Pipeline;

use App\Utilities\Git\GitIgnoreManager;
use Symfony\Component\Finder\SplFileInfo;

class RulesetFilter
{
    /**
     * @var array An array of glob patterns that, if matched, force inclusion.
     */
    protected array $include = [];

    /**
     * @var array An array of glob patterns that, if matched, force exclusion.
     */
    protected array $exclude = [];

    /**
     * Optional GitIgnoreManager instance to apply additional Git ignore rules.
     */
    protected ?GitIgnoreManager $gitIgnoreManager = null;

    /**
     * Create a new RulesetFilter instance.
     *
     * @param  array  $include  Array of glob patterns to include.
     * @param  array  $exclude  Array of glob patterns to exclude.
     * @param  GitIgnoreManager|null  $gitIgnoreManager  Optional GitIgnoreManager for extra filtering.
     */
    public function __construct(array $include = [], array $exclude = [], ?GitIgnoreManager $gitIgnoreManager = null)
    {
        $this->include = $include;
        $this->exclude = $exclude;
        $this->gitIgnoreManager = $gitIgnoreManager;
    }

    /**
     * Determine whether a given file should be accepted.
     *
     * The file is rejected if:
     *   1. The GitIgnoreManager (if provided) rejects it.
     *   2. It matches any exclude pattern.
     *
     * If include patterns are defined, the file must match at least one.
     * If no include patterns are provided, the file is accepted.
     */
    public function accept(SplFileInfo $file): bool
    {
        // If a GitIgnoreManager is provided and it rejects the file, then reject.
        if ($this->gitIgnoreManager !== null && ! $this->gitIgnoreManager->accept($file)) {
            return false;
        }

        // Normalize the relative path using forward slashes.
        $relativePath = str_replace('\\', '/', $file->getRelativePathname());

        // Check exclusion: if any exclude pattern matches, reject the file.
        foreach ($this->exclude as $pattern) {
            if (fnmatch($pattern, $relativePath)) {
                return false;
            }
        }

        // If include patterns exist, the file must match at least one.
        if (! empty($this->include)) {
            foreach ($this->include as $pattern) {
                if (fnmatch($pattern, $relativePath)) {
                    return true;
                }
            }

            return false;
        }

        // If no include patterns are defined, accept the file.
        return true;
    }
}
