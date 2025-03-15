<?php

namespace App\Pipeline\Stages;

use App\Events\DuplicateFileFoundEvent;
use App\Pipeline\FilePipelineStageInterface;
use Symfony\Component\Finder\SplFileInfo;

class DeduplicateFilesStage implements FilePipelineStageInterface
{
    /**
     * Process the array of files by removing duplicates based on file content.
     * Only one copy of each unique file content will be kept.
     *
     * @param  array  $files  An array of Symfony Finder SplFileInfo objects.
     * @param  \Closure  $next  The next stage in the pipeline.
     * @return array The deduplicated array of files.
     */
    public function handle(array $files, \Closure $next): array
    {
        $uniqueMap = [];
        $duplicatesRemoved = 0;

        foreach ($files as $file) {
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

        if ($duplicatesRemoved > 0) {
            // Report how many duplicates were removed (could use a logger here)
            echo "Removed {$duplicatesRemoved} duplicate file(s).\n";
        }

        return $next(array_values($uniqueMap));
    }
}
