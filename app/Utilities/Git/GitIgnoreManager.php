<?php

namespace App\Utilities\Git;

use Symfony\Component\Finder\Finder;
use Symfony\Component\Finder\SplFileInfo;
use RuntimeException;

class GitIgnoreManager
{
    /**
     * The base directory to scan.
     *
     * @var string
     */
    protected string $basePath;

    /**
     * An array of ignore rule sets.
     * Each element is an array with:
     *   - 'dir': The relative directory (from basePath) where the .gitignore file was found.
     *   - 'rules': An array of parsed rules.
     *
     * @var array
     */
    protected array $ignoreRules = [];

    /**
     * Create a new GitIgnoreManager.
     *
     * @param string $basePath The directory in which to look for .gitignore files.
     * @throws RuntimeException if the base path is not a valid directory.
     */
    public function __construct(string $basePath)
    {
        if (!is_dir($basePath)) {
            throw new RuntimeException("The base path {$basePath} is not a valid directory.");
        }
        $this->basePath = realpath($basePath);
        $this->loadAllGitIgnoreFiles();
    }

    /**
     * Scan for all .gitignore files under the base path and parse them.
     */
    protected function loadAllGitIgnoreFiles(): void
    {
        $finder = new Finder();
        $finder->files()->in($this->basePath)->name('.gitignore');

        foreach ($finder as $file) {
            /** @var SplFileInfo $file */
            // Get the directory where this .gitignore file lives, relative to basePath.
            $ignoreDir = str_replace($this->basePath, '', $file->getPath());
            $ignoreDir = ltrim($ignoreDir, DIRECTORY_SEPARATOR); // may be empty for top-level

            // Parse the .gitignore file.
            $rules = $this->loadGitIgnoreFile($file->getRealPath());

            $this->ignoreRules[] = [
                'dir'   => $ignoreDir, // relative directory
                'rules' => $rules,
            ];
        }

        // Sort the ignoreRules array by directory depth (shorter paths first).
        usort($this->ignoreRules, function ($a, $b) {
            $depthA = $a['dir'] === '' ? 0 : substr_count($a['dir'], DIRECTORY_SEPARATOR) + 1;
            $depthB = $b['dir'] === '' ? 0 : substr_count($b['dir'], DIRECTORY_SEPARATOR) + 1;
            return $depthA <=> $depthB;
        });
    }

    /**
     * Load and parse a single .gitignore file.
     *
     * Returns an array of rules. Each rule is an associative array with keys:
     *  - 'pattern': The processed pattern string.
     *  - 'isNegation': bool, true if the line started with '!'
     *  - 'directoryOnly': bool, true if the pattern ends with a '/'
     *  - 'hasLeadingSlash': bool, true if the pattern starts with a '/'
     *  - 'containsSlash': bool, true if the pattern (after processing) contains a '/'
     *
     * @param string $filePath
     * @return array
     */
    protected function loadGitIgnoreFile(string $filePath): array
    {
        $rules = [];
        $lines = file($filePath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            $line = trim($line);
            // Skip comments and blank lines.
            if ($line === '' || strpos($line, '#') === 0) {
                continue;
            }

            $isNegation = false;
            if (strpos($line, '!') === 0) {
                $isNegation = true;
                $line = substr($line, 1);
                $line = ltrim($line); // remove extra spaces
            }

            // Determine if the pattern is directory-only (ends with a slash).
            $directoryOnly = false;
            if (substr($line, -1) === '/') {
                $directoryOnly = true;
                $line = rtrim($line, '/');
            }

            // Check for a leading slash.
            $hasLeadingSlash = false;
            if (substr($line, 0, 1) === '/') {
                $hasLeadingSlash = true;
                $line = ltrim($line, '/');
            }

            // Check if the pattern contains a slash.
            $containsSlash = strpos($line, '/') !== false;

            // If the line is now empty, skip it.
            if ($line === '') {
                continue;
            }

            $rules[] = [
                'pattern'         => $line,
                'isNegation'      => $isNegation,
                'directoryOnly'   => $directoryOnly,
                'hasLeadingSlash' => $hasLeadingSlash,
                'containsSlash'   => $containsSlash,
            ];
        }
        return $rules;
    }

    /**
     * Determine whether a given file (as a SplFileInfo) should be accepted (i.e. not ignored)
     * based on the loaded .gitignore rules.
     *
     * @param SplFileInfo $file
     * @return bool True if the file is accepted (not ignored); false otherwise.
     */
    public function accept(SplFileInfo $file): bool
    {
        // Get the file's relative path (normalized to use forward slashes).
        $relativePath = str_replace('\\', '/', $file->getRelativePathname());
        // This will hold the final decision: true means "ignore", false means "do not ignore"
        // If no rule matches, the file is not ignored.
        $ignored = null;

        // Process each .gitignore file in order (from top-level to deeper directories)
        foreach ($this->ignoreRules as $ignoreEntry) {
            $ignoreDir = $ignoreEntry['dir'];
            // Determine if this .gitignore applies.
            if ($ignoreDir === '') {
                // Top-level .gitignore applies to all files.
                $relative = $relativePath;
            } else {
                // Only apply if the file's relative path starts with the ignore directory (plus a slash).
                $prefix = str_replace('\\', '/', $ignoreDir) . '/';
                if (strpos($relativePath, $prefix) !== 0) {
                    continue;
                }
                // Get the portion of the path relative to the .gitignore file’s directory.
                $relative = substr($relativePath, strlen($prefix));
            }

            // For each rule in this .gitignore file (in order)
            foreach ($ignoreEntry['rules'] as $rule) {
                // If the rule is directory-only but the file is not a directory, skip.
                if ($rule['directoryOnly'] && !$file->isDir()) {
                    continue;
                }

                // Determine what part of the file to match:
                // - If the rule has a leading slash, match against the path relative to the ignore file’s directory.
                // - If the rule does not contain a slash, match against the basename.
                // - Otherwise, match against the relative path.
                if ($rule['hasLeadingSlash']) {
                    $subject = $relative;
                } elseif (!$rule['containsSlash']) {
                    $subject = $file->getBasename();
                } else {
                    $subject = $relative;
                }

                // Use our matcher (which supports ** if needed)
                if ($this->matchPattern($rule['pattern'], $subject)) {
                    // Record the decision – the last matching rule wins.
                    // A non-negated rule means the file is ignored.
                    $ignored = $rule['isNegation'] ? false : true;
                }
            }
        }

        // If no rule matched, the file is accepted.
        if ($ignored === null) {
            return true;
        }
        // Otherwise, return the inverse of the ignored flag.
        return !$ignored;
    }

    /**
     * Check if a given pattern matches the subject.
     *
     * If the pattern contains '**', it is converted to a regex.
     *
     * @param string $pattern The pattern from the .gitignore rule.
     * @param string $subject The string to match against.
     * @return bool
     */
    protected function matchPattern(string $pattern, string $subject): bool
    {
        if (strpos($pattern, '**') !== false) {
            $regex = $this->convertPatternToRegex($pattern);
            return preg_match($regex, $subject) === 1;
        }
        // Use fnmatch with FNM_PATHNAME to ensure that '*' does not match directory separators.
        return fnmatch($pattern, $subject, FNM_PATHNAME);
    }

    /**
     * Convert a gitignore pattern that may include '**' into a regular expression.
     *
     * This conversion follows these guidelines:
     *  - '**' is converted to '.*' (matching any characters, including '/').
     *  - '*' is converted to '[^/]*' (matching any characters except '/').
     *  - '?' is converted to '.' (matching any single character).
     *
     * @param string $pattern
     * @return string The regex, delimited and anchored.
     */
    protected function convertPatternToRegex(string $pattern): string
    {
        // Escape regex special characters.
        $escaped = preg_quote($pattern, '/');
        // Replace the escaped \*\* with a marker.
        $escaped = str_replace('\*\*', '##DOUBLEAST##', $escaped);
        // Replace the remaining escaped \* with a pattern that does not match '/'.
        $escaped = str_replace('\*', '[^/]*', $escaped);
        // Replace the marker with '.*'
        $escaped = str_replace('##DOUBLEAST##', '.*', $escaped);
        // Replace escaped \? with '.' to match any single character.
        $escaped = str_replace('\?', '.', $escaped);

        // Return the regex anchored to the beginning and end.
        return '/^' . $escaped . '$/';
    }
}
