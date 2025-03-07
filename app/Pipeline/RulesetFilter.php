<?php

namespace App\Pipeline;

use GregPriday\GitIgnore\GitIgnoreManager;
use GregPriday\GitIgnore\PatternConverter;
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
     * @var array File paths that should always be included, regardless of other rules.
     */
    protected array $always = [];

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
     * @param  array  $always  Array of file paths that should always be included.
     * @param  GitIgnoreManager|null  $gitIgnoreManager  Optional GitIgnoreManager for extra filtering.
     * @param  PatternConverter|null  $patternConverter  Optional PatternConverter for pattern conversion.
     */
    public function __construct(
        array $include = [],
        array $exclude = [],
        array $always = [],
        ?GitIgnoreManager $gitIgnoreManager = null,
        ?PatternConverter $patternConverter = null
    ) {
        $this->include = $include;
        $this->exclude = $exclude;
        $this->always = $always;
        $this->patternConverter = $patternConverter ?? new PatternConverter;
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
     * The file is accepted if:
     *   1. Its relative path is in the "always" array.
     *
     * Otherwise, the file is rejected if:
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

        // Always include files specified in the "always" array
        if (in_array($relativePath, $this->always, true)) {
            return true;
        }

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
