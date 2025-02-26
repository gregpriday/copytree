<?php

namespace App\Pipeline;

use App\Utilities\Git\GitIgnoreManager;
use App\Utilities\Git\PatternConverter;
use Symfony\Component\Finder\SplFileInfo;

class RulesetFilter
{
    /**
     * @var array Raw glob patterns that, if matched, force inclusion.
     */
    protected array $include = [];

    /**
     * @var array Raw glob patterns that, if matched, force exclusion.
     */
    protected array $exclude = [];

    /**
     * @var array Compiled regular expressions for include patterns.
     */
    protected array $includeRegex = [];

    /**
     * @var array Compiled regular expressions for exclude patterns.
     */
    protected array $excludeRegex = [];

    /**
     * GitIgnoreManager instance for advanced pattern matching.
     */
    protected GitIgnoreManager $gitIgnoreManager;

    /**
     * PatternConverter instance for converting glob patterns to regex.
     */
    protected PatternConverter $patternConverter;

    /**
     * Create a new RulesetFilter instance.
     *
     * @param  array  $include  Array of glob patterns to include.
     * @param  array  $exclude  Array of glob patterns to exclude.
     * @param  GitIgnoreManager|null  $gitIgnoreManager  Optional GitIgnoreManager for extra filtering.
     * @param  PatternConverter|null  $patternConverter  Optional PatternConverter for pattern conversion.
     */
    public function __construct(
        array $include = [],
        array $exclude = [],
        ?GitIgnoreManager $gitIgnoreManager = null,
        ?PatternConverter $patternConverter = null
    ) {
        $this->include = $include;
        $this->exclude = $exclude;
        $this->patternConverter = $patternConverter ?? new PatternConverter();
        $this->compilePatterns();
    }

    /**
     * Compile the raw glob patterns into regular expressions.
     */
    protected function compilePatterns(): void
    {
        foreach ($this->include as $pattern) {
            $this->includeRegex[] = $this->patternConverter->patternToRegex($pattern);
        }
        foreach ($this->exclude as $pattern) {
            $this->excludeRegex[] = $this->patternConverter->patternToRegex($pattern);
        }
    }

    /**
     * Determine whether a given file should be accepted.
     *
     * The file is rejected if:
     *   1. The GitIgnoreManager rejects it.
     *   2. It matches any compiled exclude pattern.
     *
     * If include patterns are defined, the file must match at least one;
     * otherwise, the file is accepted.
     */
    public function accept(SplFileInfo $file): bool
    {
        // Normalize the file's relative path to use forward slashes.
        $relativePath = str_replace('\\', '/', $file->getRelativePathname());

        // Reject if any exclude regex matches.
        foreach ($this->excludeRegex as $regex) {
            if (preg_match($regex, $relativePath)) {
                return false;
            }
        }

        // If include regexes exist, at least one must match.
        if (! empty($this->includeRegex)) {
            foreach ($this->includeRegex as $regex) {
                if (preg_match($regex, $relativePath)) {
                    return true;
                }
            }

            return false;
        }

        // If no include patterns are defined, accept the file.
        return true;
    }
}
