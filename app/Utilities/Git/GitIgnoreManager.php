<?php

namespace App\Utilities\Git;

use ErrorException;
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
     * Scan for all .gitignore and .ctreeignore files under the base path and parse them.
     */
    protected function loadAllGitIgnoreFiles(): void
    {
        $finder = new Finder;
        // Tell Finder not to ignore dot files so that ".gitignore" and ".ctreeignore" are found.
        $finder->files()
            ->in($this->basePath)
            ->ignoreDotFiles(false)
            ->name(['.gitignore', '.ctreeignore'])
            ->followLinks(false);

        foreach ($finder as $file) {
            /** @var SplFileInfo $file */
            // Get the directory where this ignore file lives, relative to basePath.
            $ignoreDir = str_replace($this->basePath, '', $file->getPath());
            $ignoreDir = ltrim($ignoreDir, DIRECTORY_SEPARATOR); // May be empty for top-level.
            $rules = $this->loadGitIgnoreFile($file->getRealPath());

            // Prioritize .ctreeignore by adding it later in the array (last matching rule wins)
            $this->ignoreRules[] = [
                'dir' => $ignoreDir,
                'rules' => $rules,
                // Store the type of ignore file for debugging or future functionality
                'type' => $file->getFilename() === '.ctreeignore' ? 'ctreeignore' : 'gitignore',
            ];
        }

        // Check for a root-level .ctreeignore specifically (in case the finder missed it)
        $ctreeIgnorePath = $this->basePath.DIRECTORY_SEPARATOR.'.ctreeignore';
        if (file_exists($ctreeIgnorePath) && is_file($ctreeIgnorePath)) {
            $rules = $this->loadGitIgnoreFile($ctreeIgnorePath);

            // Add root-level .ctreeignore at the end so it takes precedence
            $this->ignoreRules[] = [
                'dir' => '',
                'rules' => $rules,
                'type' => 'ctreeignore',
            ];
        }

        // Sort the ignore rules by directory depth (shallower directories first).
        // For same depth, place .ctreeignore after .gitignore so it takes precedence.
        usort($this->ignoreRules, function ($a, $b) {
            $depthA = $a['dir'] === '' ? 0 : substr_count($a['dir'], DIRECTORY_SEPARATOR) + 1;
            $depthB = $b['dir'] === '' ? 0 : substr_count($b['dir'], DIRECTORY_SEPARATOR) + 1;

            if ($depthA === $depthB) {
                // If in the same directory, prioritize .ctreeignore over .gitignore
                if ($a['type'] === 'ctreeignore' && $b['type'] === 'gitignore') {
                    return 1; // Put .ctreeignore after .gitignore
                } elseif ($a['type'] === 'gitignore' && $b['type'] === 'ctreeignore') {
                    return -1; // Put .gitignore before .ctreeignore
                }
            }

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
            // Unescape backslashes so that "file\ with\ spaces.txt" becomes "file with spaces.txt"
            $line = stripcslashes($line);
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
        // Normalize the file's relative path to use forward slashes and remove any leading slash.
        $relativePath = ltrim(str_replace('\\', '/', $file->getRelativePathname()), '/');
        $ignored = false; // By default, files are not ignored.

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
                // If the rule is directory-only but this file is not a directory, skip.
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
                    // In Git, the last matching rule wins.
                    // A non-negated rule means "ignore" (set $ignored to true),
                    // while a negation flips it to false.
                    $ignored = ! $rule['isNegation'];

                    // Optimization: if a directory-only rule marks a directory as ignored, break early.
                    if ($ignored && $rule['directoryOnly']) {
                        break;
                    }
                }
            }

            // For directories, check if a parent's rule already causes ignoring.
            if ($ignored && $file->isDir()) {
                $dirPrefix = ltrim(str_replace('\\', '/', $relativePath), '/').'/';
                if ($this->isParentIgnored($dirPrefix)) {
                    return false;
                }
            }
        }

        // For all files (directories or not), if any parent directory is ignored, reject the file.
        if ($this->isParentIgnored($relativePath)) {
            return false;
        }

        return ! $ignored;
    }

    protected function isParentIgnored(string $path): bool
    {
        // Split the relative path into its components.
        $parts = explode('/', $path);
        $parentPaths = [];
        // Build all parent directory paths from the file's relative path.
        for ($i = 1; $i < count($parts); $i++) {
            $parentPaths[] = implode('/', array_slice($parts, 0, $i));
        }

        foreach ($this->ignoreRules as $entry) {
            foreach ($entry['rules'] as $rule) {
                if ($rule['directoryOnly'] && ! $rule['isNegation']) {
                    // Build the ignore path by combining the .gitignore location with the rule's pattern.
                    $ignorePath = rtrim(($entry['dir'] ? $entry['dir'].'/' : '').$rule['pattern'], '/');
                    $ignorePath = str_replace('\\', '/', $ignorePath);
                    if ($ignorePath === '') {
                        continue;
                    }
                    // Check each parent directory of the file.
                    foreach ($parentPaths as $parent) {
                        if ($this->matchPattern($ignorePath, $parent)) {
                            return true; // A parent directory matches an ignore rule.
                        }
                    }
                }
            }
        }

        return false;
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
        // If the pattern contains no '*' or '?' then use a simple string comparison.
        // (Ignore the presence of '[' so that literal patterns like "[special]file.txt" are not interpreted as globs.)
        if (strpos($pattern, '*') === false && strpos($pattern, '?') === false) {
            return $this->caseSensitive
                ? ($pattern === $subject)
                : (strcasecmp($pattern, $subject) === 0);
        }

        // If the pattern contains '**', convert it to a regex.
        if (strpos($pattern, '**') !== false) {
            $regex = $this->convertPatternToRegex($pattern);
            $flags = $this->caseSensitive ? '' : 'i'; // Case-insensitive flag.

            try {
                return preg_match($regex, $subject) === 1;
            } catch (ErrorException $e) {
                return false;
            }
        }

        // Otherwise, use fnmatch (with FNM_PATHNAME for correct '/' handling).
        $flags = FNM_PATHNAME;
        if (! $this->caseSensitive) {
            $flags |= FNM_CASEFOLD;
        }

        return fnmatch($pattern, $subject, $flags);
    }

    /**
     * Convert a gitignore pattern (which may include '**') into a regular expression.
     *
     * The resulting regex is anchored at the beginning and end.
     */
    protected function convertPatternToRegex(string $pattern): string
    {
        $prefix = '';
        if (substr($pattern, 0, 3) === '**/') {
            $prefix = '(?:.*\/)?';
            $pattern = substr($pattern, 3);
        }

        // Replace '/**/' with a temporary token.
        $pattern = str_replace('/**/', '___DOUBLEAST___', $pattern);

        // Escape the pattern so that all regex special characters are treated literally.
        $escaped = preg_quote($pattern, '/');

        // Restore our token with a regex fragment that allows an optional directory segment.
        $escaped = str_replace('___DOUBLEAST___', '(?:\/.*)?', $escaped);

        // Replace any remaining '**' with '.*'
        $escaped = str_replace('\*\*', '.*', $escaped);

        // Replace remaining '*' with a pattern that matches any number of characters except a slash.
        $escaped = str_replace('\*', '[^/]*', $escaped);

        // Replace '?' with '.' (any single character).
        $escaped = str_replace('\?', '.', $escaped);

        // Instead of unconditionally unescaping "[" and "]",
        // use a callback to only unescape balanced bracket expressions.
        $escaped = preg_replace_callback('/\\\\\[([^\\\\\]]*)\\\\\]/', function ($matches) {
            return '['.$matches[1].']';
        }, $escaped);

        return '/^'.$prefix.$escaped.'$/';
    }
}
