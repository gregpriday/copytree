<?php

namespace App\Utilities\Git;

/**
 * PatternConverter
 *
 * A class to convert gitignore-style glob patterns to regular expressions.
 */
class PatternConverter
{
    /**
     * Convert a gitignore-style pattern to a regular expression pattern.
     *
     * @param  string  $pattern  The gitignore pattern to convert
     * @return string The regular expression pattern (without delimiters)
     */
    public function convertPatternToRegex(string $pattern): string
    {
        // Expand braces before any regex conversion
        $expandedPatterns = $this->expandBraces($pattern);

        // If we have multiple expanded patterns from braces, handle each one
        if (count($expandedPatterns) > 1) {
            $regexParts = [];
            foreach ($expandedPatterns as $expandedPattern) {
                $regexParts[] = $this->convertSinglePatternToRegex($expandedPattern);
            }

            return '(?:'.implode('|', $regexParts).')';
        }

        // Otherwise, convert the single pattern
        return $this->convertSinglePatternToRegex($expandedPatterns[0]);
    }

    /**
     * Convert a single gitignore pattern (without braces) to a regular expression.
     *
     * @param  string  $pattern  The pattern to convert
     * @return string The regular expression pattern (without delimiters)
     */
    protected function convertSinglePatternToRegex(string $pattern): string
    {
        // First identify if we're dealing with a pattern that starts with **/
        $startsWithDoubleAsterisk = false;
        if (strpos($pattern, '**/') === 0) {
            $startsWithDoubleAsterisk = true;
            $pattern = substr($pattern, 3); // Remove the **/ prefix for now
        }

        // Handle escaped special characters by converting them to markers
        $pattern = preg_replace_callback('/\\\\([*?{}\[\]])/', function ($matches) {
            return '{{ESCAPED_'.bin2hex($matches[1]).'}}';
        }, $pattern);

        // Replace wildcards with unique placeholders that won't be affected by preg_quote
        $pattern = str_replace('**/', '{{DOUBLE_STAR_SLASH}}', $pattern);
        $pattern = str_replace('**', '{{DOUBLE_STAR}}', $pattern);
        $pattern = str_replace('*', '{{STAR}}', $pattern);
        $pattern = str_replace('?', '{{QUESTION}}', $pattern);

        // Restore escaped special characters
        $pattern = preg_replace_callback('/{{ESCAPED_([0-9a-f]+)}}/', function ($matches) {
            return chr(hexdec($matches[1]));
        }, $pattern);

        // Escape all other regex special characters
        $pattern = preg_quote($pattern, '/');

        // Replace placeholders with their regex equivalents
        $pattern = str_replace(preg_quote('{{DOUBLE_STAR_SLASH}}', '/'), '(?:.*?/)?', $pattern);
        $pattern = str_replace(preg_quote('{{DOUBLE_STAR}}', '/'), '.*', $pattern);
        $pattern = str_replace(preg_quote('{{STAR}}', '/'), '[^/]*', $pattern);
        $pattern = str_replace(preg_quote('{{QUESTION}}', '/'), '.', $pattern);

        // If the pattern started with **/, add the appropriate prefix
        if ($startsWithDoubleAsterisk) {
            return '(?:.*/)?'.$pattern;
        }

        return $pattern;
    }

    /**
     * Recursively expand brace expressions in a pattern.
     *
     * @param  string  $pattern  The pattern containing brace expressions
     * @return string[] An array of expanded patterns
     */
    public function expandBraces(string $pattern): array
    {
        // If there are no braces, return the pattern as-is
        if (! str_contains($pattern, '{')) {
            return [$pattern];
        }

        // Find the first opening brace
        $posOpen = strpos($pattern, '{');

        // Find the matching closing brace
        $posClose = $this->findMatchingCloseBrace($pattern, $posOpen);

        // If no matching closing brace, return the pattern as-is
        if ($posClose === false) {
            return [$pattern];
        }

        // Extract parts before and after the braces, and the options inside
        $prefix = substr($pattern, 0, $posOpen);
        $suffix = substr($pattern, $posClose + 1);
        $inside = substr($pattern, $posOpen + 1, $posClose - $posOpen - 1);

        // Split inside by commas that aren't inside nested braces
        $options = $this->splitOptionsRespectingNesting($inside);

        // Combine each option with the prefix and suffix, and expand any nested braces
        $results = [];
        foreach ($options as $option) {
            $expanded = $prefix.$option.$suffix;
            $results = array_merge($results, $this->expandBraces($expanded));
        }

        return $results;
    }

    /**
     * Find the position of the matching closing brace.
     *
     * @param  string  $pattern  The pattern to search in
     * @param  int  $posOpen  The position of the opening brace
     * @return int|false The position of the matching closing brace, or false if not found
     */
    protected function findMatchingCloseBrace(string $pattern, int $posOpen): int|false
    {
        $length = strlen($pattern);
        $nesting = 0;

        for ($i = $posOpen; $i < $length; $i++) {
            if ($pattern[$i] === '{') {
                $nesting++;
            } elseif ($pattern[$i] === '}') {
                $nesting--;
                if ($nesting === 0) {
                    return $i;
                }
            }
        }

        return false;
    }

    /**
     * Split options at commas, respecting nested braces.
     *
     * @param  string  $inside  The content inside a set of braces
     * @return string[] An array of options
     */
    protected function splitOptionsRespectingNesting(string $inside): array
    {
        $options = [];
        $start = 0;
        $nesting = 0;
        $length = strlen($inside);

        for ($i = 0; $i < $length; $i++) {
            if ($inside[$i] === '{') {
                $nesting++;
            } elseif ($inside[$i] === '}') {
                $nesting--;
            } elseif ($inside[$i] === ',' && $nesting === 0) {
                $options[] = substr($inside, $start, $i - $start);
                $start = $i + 1;
            }
        }

        // Add the last option
        $options[] = substr($inside, $start);

        return $options;
    }

    /**
     * Convert a pattern to a regular expression with delimiters and anchors.
     *
     * @param  string  $pattern  The gitignore pattern
     * @return string The complete regular expression
     */
    public function patternToRegex(string $pattern): string
    {
        $regex = $this->convertPatternToRegex($pattern);

        return '#^'.$regex.'$#';
    }
}
