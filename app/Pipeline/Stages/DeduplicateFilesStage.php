<?php

namespace App\Pipeline\Stages;

use App\Events\DuplicateFileFoundEvent;
use App\Pipeline\FilePipelineStageInterface;
use Symfony\Component\Finder\SplFileInfo;

class DeduplicateFilesStage implements FilePipelineStageInterface
{
    /**
     * Process files through the deduplication stage.
     *
     * @param array $files Array of SplFileInfo objects to process.
     * @param Closure $next The next stage in the pipeline.
     * @return array The filtered array of unique files.
     */
    public function handle(array $files, \Closure $next): array
    {
        $uniqueMap = [];
        $duplicatesRemoved = 0;

        foreach ($files as $file) {
            // Skip content-based deduplication for large or binary files
            if ($this->shouldSkipDeduplication($file)) {
                // Large or binary files are always included without content checks
                $uniqueMap[$file->getRelativePathname()] = $file;
                continue;
            }

            // Hash the file contents to identify duplicates
            $hash = md5_file($file->getRealPath());

            // If we haven't seen this file content yet, add it to our map
            if (! isset($uniqueMap[$hash])) {
                $uniqueMap[$hash] = $file;
                continue;
            }

            // We've found a duplicate, fire an event with the duplicate file
            event(new DuplicateFileFoundEvent($file));

            // We've found a duplicate, decide which one to keep
            // Strategy: prefer the file with the shorter path (usually closer to project root)
            $existingFile = $uniqueMap[$hash];
            $existingPath = $existingFile->getRelativePathname();
            $currentPath = $file->getRelativePathname();

            if (strlen($currentPath) < strlen($existingPath)) {
                // The current file has a shorter path, so keep it instead
                // Fire an event for the file we're replacing
                event(new DuplicateFileFoundEvent($existingFile));
                $uniqueMap[$hash] = $file;
            }

            $duplicatesRemoved++;
        }

        return $next(array_values($uniqueMap));
    }

    /**
     * Determine if a file should skip content-based deduplication.
     *
     * @param SplFileInfo $file The file to check.
     * @return bool True if the file is large (>1MB) or binary, false otherwise.
     */
    private function shouldSkipDeduplication(SplFileInfo $file): bool
    {
        return $file->getSize() > 1024 * 1024 || $this->isBinaryFile($file);
    }

    /**
     * Check if a file is binary by examining the first 8192 bytes for null bytes.
     *
     * @param SplFileInfo $file The file to inspect.
     * @return bool True if binary, false otherwise.
     */
    private function isBinaryFile(SplFileInfo $file): bool
    {
        $handle = fopen($file->getRealPath(), 'r');
        if ($handle === false) {
            return false; // Cannot open file, treat as non-binary
        }
        $chunk = fread($handle, 8192);
        fclose($handle);
        return $chunk !== false && str_contains($chunk, "\0");
    }
}
