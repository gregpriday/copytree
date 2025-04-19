<?php

namespace App\Pipeline\Stages;

use App\Pipeline\FilePipelineStageInterface;
use GregPriday\GitIgnore\PatternConverter;
use Illuminate\Support\Facades\Log;
use Symfony\Component\Finder\Finder;
use Symfony\Component\Finder\SplFileInfo;

/**
 * Pipeline stage to ensure files specified in the "always" list are included
 * in the final output, regardless of previous filtering stages.
 *
 * This stage should be placed at the end of the pipeline to ensure these files
 * are always included, even if they were excluded by earlier stages or not found
 * in the initial FileLoader scan.
 */
class AlwaysIncludeStage implements FilePipelineStageInterface
{
    /**
     * The base path of the project.
     */
    protected string $basePath;

    /**
     * Array of relative file paths that should always be included.
     */
    protected array $alwaysInclude;

    protected PatternConverter $patternConverter;

    /**
     * Create a new AlwaysIncludeStage.
     *
     * @param  string  $basePath  The base path of the project.
     * @param  array  $alwaysInclude  Array of relative file paths to always include.
     */
    public function __construct(string $basePath, array $alwaysInclude = [])
    {
        $this->basePath = rtrim($basePath, DIRECTORY_SEPARATOR);
        $this->alwaysInclude = $alwaysInclude;
        $this->patternConverter = new PatternConverter();
    }

    /**
     * Process the file collection by ensuring "always include" files are present.
     *
     * @param  array  $files  An array of Symfony Finder SplFileInfo objects.
     * @param  \Closure  $next  The next stage in the pipeline.
     * @return array The processed array of files.
     */
    public function handle(array $files, \Closure $next): array
    {
        if (empty($this->alwaysInclude)) {
            return $next($files);
        }

        // Create a lookup of existing files by relative pathname
        $existingFiles = [];
        foreach ($files as $file) {
            $normalizedPath = str_replace('\\', '/', $file->getRelativePathname());
            $existingFiles[$normalizedPath] = $file;
        }

        $filesToAdd = [];

        foreach ($this->alwaysInclude as $alwaysItem) {
            // Check if the item is likely a glob pattern
            if ($this->isGlobPattern($alwaysItem)) {
                // --- Handle Glob Pattern ---
                try {
                    // Convert gitignore glob to regex for Finder's path()
                    $regexPattern = $this->patternConverter->patternToRegex($alwaysItem);

                    $finder = new Finder();
                    $finder->files()
                           ->in($this->basePath)
                           ->path($regexPattern)
                           ->ignoreDotFiles(false)
                           ->ignoreVCS(true);

                    foreach ($finder as $foundFile) {
                        /** @var SplFileInfo $foundFile */
                        // Ensure we have a relative path for lookup consistency
                        $relativePath = str_replace('\\', '/', $foundFile->getRelativePathname());

                        // Add only if not already in the list passed to this stage
                        // and not already queued to be added by another pattern/exact match
                        if (!isset($existingFiles[$relativePath]) && !isset($filesToAdd[$relativePath])) {
                            // Use relative path as key to prevent duplicates from overlapping patterns
                            $filesToAdd[$relativePath] = $foundFile;
                        }
                    }
                } catch (\Exception $e) {
                    // Log error if Finder fails for a pattern
                    Log::warning(
                        "Error processing 'always' pattern '{$alwaysItem}' in AlwaysIncludeStage: " . $e->getMessage()
                    );
                }
            } else {
                // --- Handle Exact Path ---
                $normalizedPath = str_replace('\\', '/', $alwaysItem);

                // Skip if the exact file is already included or queued to be added
                if (isset($existingFiles[$normalizedPath]) || isset($filesToAdd[$normalizedPath])) {
                    continue;
                }

                // Check if the exact file exists on disk relative to the base path
                $fullPath = $this->basePath . DIRECTORY_SEPARATOR . $alwaysItem;
                if (file_exists($fullPath) && is_file($fullPath)) {
                    // Create SplFileInfo relative to basePath
                    // dirname('.') returns '.', handle this case for root files
                    $relativeDir = dirname($normalizedPath);
                    $relativeDir = ($relativeDir === '.') ? '' : $relativeDir;

                    $newFile = new SplFileInfo(
                        $fullPath,
                        $relativeDir,
                        $normalizedPath
                    );
                    $filesToAdd[$normalizedPath] = $newFile;
                } else {
                     Log::debug("Exact path '{$alwaysItem}' specified in 'always' not found or is not a file at: {$fullPath}");
                }
            }
        }

        // Merge the newly found files with the original list
        // array_values ensures we have a simple indexed array for the next stage
        $finalFiles = array_merge($files, array_values($filesToAdd));

        // Ensure uniqueness again based on real path just in case Finder found duplicates
        // or if the same file was passed in and also matched an 'always' rule.
        $uniqueFiles = [];
        foreach ($finalFiles as $file) {
            // Use realpath to get a canonical absolute path for uniqueness check
            $realPath = $file->getRealPath();
            if ($realPath !== false) { // Ensure realpath() didn't fail
                 $uniqueFiles[$realPath] = $file;
            } else {
                // Handle cases where realpath might fail (e.g., broken symlinks, though less likely with is_file check)
                // Use relative path as fallback key, less robust but better than discarding
                $fallbackPath = str_replace('\\', '/', $file->getRelativePathname());
                if (!isset($uniqueFiles[$fallbackPath])) {
                    $uniqueFiles[$fallbackPath] = $file;
                     Log::debug("Could not get real path for {$fallbackPath}, using relative path for uniqueness check.");
                }
            }
        }

        // Pass the unique list (re-indexed) to the next stage
        return $next(array_values($uniqueFiles));
    }

    /**
     * Basic check to see if a string looks like a common glob pattern character.
     * More complex patterns involving ranges [] or groups {} are also included.
     *
     * @param string $item The string to check.
     * @return bool True if it contains glob characters, false otherwise.
     */
    private function isGlobPattern(string $item): bool
    {
        // Check for common glob characters: *, ?, [, {
        // No need to check for '**' specifically, '*' covers it.
        return str_contains($item, '*') || str_contains($item, '?') || str_contains($item, '[') || str_contains($item, '{');
    }
}
