<?php

namespace App\Utilities\Git;

use RuntimeException;
use Symfony\Component\Finder\Finder;
use Symfony\Component\Finder\SplFileInfo;

class GitIgnoreManager
{
    /**
     * The base directory to scan.
     */
    protected string $basePath;

    /**
     * An array of ignore rule sets.
     * Each element is an associative array with keys:
     *  - 'dir': The relative directory (from basePath) where the .gitignore file was found.
     *  - 'rules': An array of parsed rules.
     */
    protected array $ignoreRules = [];

    /**
     * Whether pattern matching is case-sensitive.
     */
    protected bool $caseSensitive;

    /**
     * Create a new GitIgnoreManager.
     *
     * @param  string  $basePath  The directory in which to look for .gitignore files.
     * @param  bool  $caseSensitive  Whether matching should be case sensitive. Defaults to true.
     *
     * @throws RuntimeException if the base path is not a valid directory.
     */
    public function __construct(string $basePath, bool $caseSensitive = true)
    {
        if (! is_dir($basePath)) {
            throw new RuntimeException("The base path {$basePath} is not a valid directory.");
        }
        $this->basePath = realpath($basePath);
        $this->caseSensitive = $caseSensitive;
        $this->loadAllGitIgnoreFiles();
    }

    /**
     * Scan for all .gitignore files under the base path and parse them.
     */
    protected function loadAllGitIgnoreFiles(): void
    {
        $finder = new Finder;
        // Do not follow symbolic links.
        $finder->files()->in($this->basePath)->name('.gitignore')->followLinks(false);

        foreach ($finder as $file) {
            /** @var SplFileInfo $file */
            // Get the directory where this .gitignore file lives, relative to basePath.
            $ignoreDir = str_replace($this->basePath, '', $file->getPath());
            $ignoreDir = ltrim($ignoreDir, DIRECTORY_SEPARATOR); // May be empty for top-level.
            $rules = $this->loadGitIgnoreFile($file->getRealPath());
            $this->ignoreRules[] = [
                'dir' => $ignoreDir,
                'rules' => $rules,
            ];
        }

        // Sort the ignore rules by directory depth (shallower directories first).
        usort($this->ignoreRules, function ($a, $b) {
            $depthA = $a['dir'] === '' ? 0 : substr_count($a['dir'], DIRECTORY_SEPARATOR) + 1;
            $depthB = $b['dir'] === '' ? 0 : substr_count($b['dir'], DIRECTORY_SEPARATOR) + 1;

            return $depthA <=> $depthB;
        });
    }

    /**
     * Load and parse a single .gitignore file.
     *
     * Each rule is returned as an associative array with the following keys:
     *  - 'pattern': The rule pattern (with any leading or trailing slashes removed).
     *  - 'isNegation': Boolean, true if the line began with '!' (meaning re-include).
     *  - 'directoryOnly': Boolean, true if the rule ended with a '/'.
     *  - 'hasLeadingSlash': Boolean, true if the rule started with a '/'.
     *  - 'containsSlash': Boolean, true if the rule (after trimming) contains a '/'.
     */
    protected function loadGitIgnoreFile(string $filePath): array
    {
        $rules = [];
        $lines = file($filePath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            $line = trim($line);
            // Skip blank lines or comments.
            if ($line === '' || strpos($line, '#') === 0) {
                continue;
            }

            $isNegation = false;
            if (strpos($line, '!') === 0) {
                $isNegation = true;
                $line = substr($line, 1);
                $line = ltrim($line);
            }

            $directoryOnly = false;
            if (substr($line, -1) === '/') {
                $directoryOnly = true;
                $line = rtrim($line, '/');
            }

            $hasLeadingSlash = false;
            if (substr($line, 0, 1) === '/') {
                $hasLeadingSlash = true;
                $line = ltrim($line, '/');
            }

            $containsSlash = strpos($line, '/') !== false;

            if ($line === '') {
                continue;
            }

            $rules[] = [
                'pattern' => $line,
                'isNegation' => $isNegation,
                'directoryOnly' => $directoryOnly,
                'hasLeadingSlash' => $hasLeadingSlash,
                'containsSlash' => $containsSlash,
            ];
        }

        return $rules;
    }

    /**
     * Determine whether a given file should be accepted (i.e. not ignored)
     * based on all applicable .gitignore rules.
     *
     * The rules are processed in order—from the shallowest (top‑level) .gitignore
     * files to deeper ones—with the last matching rule (including negations)
     * determining the outcome.
     *
     * @return bool True if the file is accepted (not ignored); false otherwise.
     */
    public function accept(SplFileInfo $file): bool
    {
        // Normalize the file's relative path to use forward slashes.
        $relativePath = str_replace('\\', '/', $file->getRelativePathname());
        $ignored = false; // Initialize: by default, files are not ignored.

        foreach ($this->ignoreRules as $ignoreEntry) {
            $ignoreDir = $ignoreEntry['dir'];

            // Determine if this .gitignore file applies.
            if ($ignoreDir === '') {
                // Top-level .gitignore applies to all files.
                $relative = $relativePath;
            } else {
                $prefix = str_replace('\\', '/', $ignoreDir).'/';
                if (strpos($relativePath, $prefix) !== 0) {
                    continue;
                }
                $relative = substr($relativePath, strlen($prefix));
            }

            // Process each rule in this .gitignore.
            foreach ($ignoreEntry['rules'] as $rule) {
                // If the rule is marked as directory-only but this file is not a directory, skip.
                if ($rule['directoryOnly'] && ! $file->isDir()) {
                    continue;
                }

                // Determine which part of the file to match:
                // - If the rule has a leading slash, match against the path relative to the .gitignore file.
                // - If the rule does not contain a slash, match only the basename.
                // - Otherwise, match against the relative path.
                if ($rule['hasLeadingSlash']) {
                    $subject = $relative;
                } elseif (! $rule['containsSlash']) {
                    $subject = $file->getBasename();
                } else {
                    $subject = $relative;
                }

                if ($this->matchPattern($rule['pattern'], $subject)) {
                    // In this implementation, the last matching rule wins.
                    // A non-negated rule means "ignore" (i.e. set $ignored to true),
                    // while a negation flips it to false.
                    $ignored = ! $rule['isNegation'];

                    // Optimization: if a directory-only rule marks a directory as ignored, break early.
                    if ($ignored && $rule['directoryOnly']) {
                        break;
                    }
                }
            }

            // Optimization: For directories, if a parent's rule already causes ignoring,
            // we may skip further processing.
            if ($ignored && $file->isDir()) {
                $dirPrefix = str_replace('\\', '/', $relativePath).'/';
                $isParentIgnored = function ($path) {
                    foreach ($this->ignoreRules as $entry) {
                        foreach ($entry['rules'] as $rule) {
                            if ($rule['directoryOnly'] && ! $rule['isNegation']) {
                                $ignorePath = rtrim(($entry['dir'] ? $entry['dir'].'/' : '').$rule['pattern'], '/');
                                $ignorePath = str_replace('\\', '/', $ignorePath);
                                if ($ignorePath === '') {
                                    continue;
                                }
                                if (strpos($path, $ignorePath.'/') === 0 || $path === $ignorePath) {
                                    return true;
                                }
                            }
                        }
                    }

                    return false;
                };

                if ($isParentIgnored($dirPrefix)) {
                    return false;
                }
            }
        }

        // If no matching rule was found or the last match did not indicate ignore, accept the file.
        return ! $ignored;
    }

    /**
     * Check if a given pattern matches the subject.
     *
     * If the pattern contains '**', it is converted into a regular expression.
     *
     * @param  string  $pattern  The pattern from the .gitignore rule.
     * @param  string  $subject  The string to match against.
     */
    protected function matchPattern(string $pattern, string $subject): bool
    {
        if (strpos($pattern, '**') !== false) {
            $regex = $this->convertPatternToRegex($pattern);
            $flags = $this->caseSensitive ? '' : 'i';

            return preg_match($regex.$flags, $subject) === 1;
        }
        $flags = $this->caseSensitive ? 0 : FNM_CASEFOLD;

        return fnmatch($pattern, $subject, FNM_PATHNAME | $flags);
    }

    /**
     * Convert a gitignore pattern (which may include '**') into a regular expression.
     *
     * Conversion rules:
     *  - '**' is converted to '.*' (matching any characters including directory separators).
     *  - '*' is converted to '[^/]*' (matching any characters except '/').
     *  - '?' is converted to '.' (matching any single character).
     *  - Other regex special characters are escaped.
     *
     * The resulting regex is anchored at the beginning and end.
     *
     * @return string The regex pattern, including delimiters.
     */
    protected function convertPatternToRegex(string $pattern): string
    {
        // Escape regex special characters (using '/' as delimiter).
        $escaped = preg_quote($pattern, '/');

        // Replace escaped '**' with a temporary marker.
        $escaped = str_replace('\*\*', '##DOUBLEAST##', $escaped);

        // Replace remaining '*' (escaped) with a pattern that does not match '/'.
        $escaped = str_replace('\*', '[^/]*', $escaped);

        // Replace the temporary marker with '.*'
        $escaped = str_replace('##DOUBLEAST##', '.*', $escaped);

        // Replace escaped '?' with '.' (any single character).
        $escaped = str_replace('\?', '.', $escaped);

        // Return the regex anchored with ^ and $.
        return '/^'.$escaped.'$/';
    }
}
