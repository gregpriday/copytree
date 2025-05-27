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
     * @var array Advanced rules for filtering.
     */
    protected array $rules = [];

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
     * @param  array|array[]  $includeOrRules  Array of glob patterns to include OR array of advanced rules.
     * @param  array  $exclude  Array of glob patterns to exclude.
     * @param  array  $always  Array of file paths that should always be included.
     * @param  GitIgnoreManager|null  $gitIgnoreManager  Optional GitIgnoreManager for extra filtering.
     * @param  PatternConverter|null  $patternConverter  Optional PatternConverter for pattern conversion.
     */
    public function __construct(
        array $includeOrRules = [],
        array $exclude = [],
        array $always = [],
        ?GitIgnoreManager $gitIgnoreManager = null,
        ?PatternConverter $patternConverter = null
    ) {
        // Check if first argument is an array of rules (advanced format)
        if (!empty($includeOrRules) && is_array($includeOrRules[0]) && is_array($includeOrRules[0][0] ?? null)) {
            $this->rules = $includeOrRules;
        } 
        // Check if exclude parameter contains advanced rules
        elseif (!empty($exclude) && is_array($exclude[0]) && is_array($exclude[0][0] ?? null)) {
            // Store exclude rules separately, they'll be handled differently in evaluateRules
            $this->rules = ['exclude' => $exclude];
        } else {
            $this->include = $includeOrRules;
            $this->exclude = $exclude;
            
            // Handle always array - can be simple array or associative with 'include'/'exclude' keys
            if (isset($always['include']) || isset($always['exclude'])) {
                if (isset($always['include'])) {
                    $this->always = $always['include'];
                }
                if (isset($always['exclude'])) {
                    // Convert 'always exclude' patterns to exclude patterns
                    $this->exclude = array_merge($this->exclude, $always['exclude']);
                }
            } else {
                $this->always = $always;
            }
        }
        $this->patternConverter = $patternConverter ?? new PatternConverter;
        $this->compilePatterns();
    }
    
    /**
     * Negate an operator for exclude rules.
     */
    protected function negateOperator(string $operator): string
    {
        return match ($operator) {
            '=', 'is' => '!=',
            '!=', 'isNot' => '=',
            'contains' => 'notContains',
            'notContains' => 'contains',
            'startsWith' => 'notStartsWith',
            'notStartsWith' => 'startsWith',
            'endsWith' => 'notEndsWith',
            'notEndsWith' => 'endsWith',
            'startsWithAny' => 'notStartsWithAny',
            'notStartsWithAny' => 'startsWithAny',
            'endsWithAny' => 'notEndsWithAny',
            'notEndsWithAny' => 'endsWithAny',
            'containsAny' => 'notContainsAny',
            'notContainsAny' => 'containsAny',
            'regex', 'matches' => 'notMatches',
            'notMatches' => 'matches',
            default => $operator,
        };
    }

    /**
     * Compile the raw glob patterns into regular expressions.
     */
    protected function compilePatterns(): void
    {
        // Skip pattern compilation if using advanced rules
        if (!empty($this->rules)) {
            return;
        }
        
        foreach ($this->include as $pattern) {
            // Skip if pattern is not a string (shouldn't happen with proper constructor logic)
            if (!is_string($pattern)) {
                continue;
            }
            
            // If an include pattern ends with '/', treat it as matching everything inside that directory.
            if (str_ends_with($pattern, '/')) {
                $pattern .= '**';
            }
            $this->includeRegex[] = $this->patternConverter->patternToRegex($pattern);
        }
        foreach ($this->exclude as $pattern) {
            if (!is_string($pattern)) {
                continue;
            }
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
        // Use advanced rules if available
        if (!empty($this->rules)) {
            return $this->evaluateRules($file);
        }
        
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
    
    /**
     * Evaluate advanced rules for a file.
     */
    protected function evaluateRules(SplFileInfo $file): bool
    {
        // Check if we have exclude rules
        if (isset($this->rules['exclude'])) {
            foreach ($this->rules['exclude'] as $ruleGroup) {
                $groupResult = true;
                
                foreach ($ruleGroup as $rule) {
                    if (!is_array($rule) || count($rule) < 3) {
                        continue;
                    }
                    
                    [$field, $operator, $value] = $rule;
                    
                    $fieldValue = $this->getFieldValue($file, $field);
                    $ruleResult = $this->evaluateRule($fieldValue, $operator, $value);
                    
                    // Within a group, all rules must match (AND logic)
                    if (!$ruleResult) {
                        $groupResult = false;
                        break;
                    }
                }
                
                // If any exclude group matches, reject the file
                if ($groupResult) {
                    return false;
                }
            }
            return true;
        }
        
        // Regular include rules
        foreach ($this->rules as $ruleGroup) {
            $groupResult = true;
            
            foreach ($ruleGroup as $rule) {
                if (!is_array($rule) || count($rule) < 3) {
                    continue;
                }
                
                [$field, $operator, $value] = $rule;
                
                $fieldValue = $this->getFieldValue($file, $field);
                $ruleResult = $this->evaluateRule($fieldValue, $operator, $value);
                
                // Within a group, all rules must match (AND logic)
                if (!$ruleResult) {
                    $groupResult = false;
                    break;
                }
            }
            
            // All groups must be true (AND logic between groups)
            if (!$groupResult) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * Get the value of a field from the file.
     */
    protected function getFieldValue(SplFileInfo $file, string $field): string
    {
        return match ($field) {
            'folder' => dirname($file->getRelativePathname()),
            'filename' => $file->getFilename(),
            'basename' => $file->getBasename(),
            'extension' => $file->getExtension(),
            'path' => $file->getRelativePathname(),
            'contents' => $file->isFile() && $file->isReadable() ? file_get_contents($file->getRealPath()) : '',
            default => '',
        };
    }
    
    /**
     * Evaluate a single rule.
     */
    protected function evaluateRule(string $fieldValue, string $operator, mixed $value): bool
    {
        return match ($operator) {
            '=', 'is' => $fieldValue === $value,
            '!=', 'isNot' => $fieldValue !== $value,
            'contains' => str_contains($fieldValue, $value),
            'notContains' => !str_contains($fieldValue, $value),
            'startsWith' => str_starts_with($fieldValue, $value),
            'notStartsWith' => !str_starts_with($fieldValue, $value),
            'endsWith' => str_ends_with($fieldValue, $value),
            'notEndsWith' => !str_ends_with($fieldValue, $value),
            'startsWithAny' => $this->startsWithAny($fieldValue, $value),
            'notStartsWithAny' => !$this->startsWithAny($fieldValue, $value),
            'startsWithAll' => $this->startsWithAll($fieldValue, $value),
            'endsWithAny' => $this->endsWithAny($fieldValue, $value),
            'notEndsWithAny' => !$this->endsWithAny($fieldValue, $value),
            'containsAny' => $this->containsAny($fieldValue, $value),
            'notContainsAny' => !$this->containsAny($fieldValue, $value),
            'containsAll' => $this->containsAll($fieldValue, $value),
            'regex', 'matches' => (bool) preg_match($value, $fieldValue),
            'notMatches' => !preg_match($value, $fieldValue),
            default => false,
        };
    }
    
    /**
     * Check if string starts with any of the given prefixes.
     */
    protected function startsWithAny(string $string, array $prefixes): bool
    {
        foreach ($prefixes as $prefix) {
            if (str_starts_with($string, $prefix)) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * Check if string starts with all of the given prefixes.
     */
    protected function startsWithAll(string $string, array $prefixes): bool
    {
        foreach ($prefixes as $prefix) {
            if (!str_starts_with($string, $prefix)) {
                return false;
            }
        }
        return true;
    }
    
    /**
     * Check if string ends with any of the given suffixes.
     */
    protected function endsWithAny(string $string, array $suffixes): bool
    {
        foreach ($suffixes as $suffix) {
            if (str_ends_with($string, $suffix)) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * Check if string contains any of the given substrings.
     */
    protected function containsAny(string $string, array $substrings): bool
    {
        foreach ($substrings as $substring) {
            if (str_contains($string, $substring)) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * Check if string contains all of the given substrings.
     */
    protected function containsAll(string $string, array $substrings): bool
    {
        foreach ($substrings as $substring) {
            if (!str_contains($string, $substring)) {
                return false;
            }
        }
        return true;
    }
}
