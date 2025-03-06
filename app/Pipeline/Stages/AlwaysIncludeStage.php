<?php

namespace App\Pipeline\Stages;

use App\Pipeline\FilePipelineStageInterface;
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

        // Add any missing "always include" files
        foreach ($this->alwaysInclude as $alwaysFile) {
            // Normalize the path
            $normalizedPath = str_replace('\\', '/', $alwaysFile);
            
            // Skip if the file is already included
            if (isset($existingFiles[$normalizedPath])) {
                continue;
            }
            
            // Check if the file exists
            $fullPath = $this->basePath . DIRECTORY_SEPARATOR . $alwaysFile;
            if (file_exists($fullPath) && is_file($fullPath)) {
                // Create a new SplFileInfo and add it to the files array
                $dirname = dirname($alwaysFile);
                $dirname = $dirname === '.' ? '' : $dirname;
                $newFile = new SplFileInfo(
                    $fullPath,
                    $dirname,
                    $alwaysFile
                );
                $files[] = $newFile;
            }
        }

        return $next($files);
    }
} 