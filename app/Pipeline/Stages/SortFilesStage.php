<?php

namespace App\Pipeline\Stages;

use App\Pipeline\FilePipelineStageInterface;
use Symfony\Component\Finder\SplFileInfo;

class SortFilesStage implements FilePipelineStageInterface
{
    /**
     * Compare two files based on their relative paths in a nested alphabetical order.
     *
     * This method splits the relative paths into components (using "/" as the delimiter)
     * and compares them component by component (using a case‑insensitive comparison).
     * If the common parts are equal, the file with fewer components (i.e. a parent directory)
     * is considered "less" (and will come first).
     *
     * @return int Returns negative if $a should appear before $b, positive if after, or zero if equal.
     */
    protected function compareFiles(SplFileInfo $a, SplFileInfo $b): int
    {
        $aPath = $a->getRelativePathname();
        $bPath = $b->getRelativePathname();

        // Use '/' as the delimiter since Finder returns relative paths with forward slashes.
        $aParts = explode('/', $aPath);
        $bParts = explode('/', $bPath);
        $minCount = min(count($aParts), count($bParts));

        // Compare each level of the directory structure.
        for ($i = 0; $i < $minCount; $i++) {
            $cmp = strcasecmp($aParts[$i], $bParts[$i]);
            if ($cmp !== 0) {
                return $cmp;
            }
        }

        // If all compared parts are equal, the one with fewer components (i.e. higher in the hierarchy)
        // comes first.
        return count($aParts) - count($bParts);
    }

    /**
     * Process the array of files by sorting them in nested alphabetical order.
     *
     * @param  array  $files  An array of Symfony Finder SplFileInfo objects.
     * @param  \Closure  $next  The next stage in the pipeline.
     * @return array The sorted array of files.
     */
    public function handle(array $files, \Closure $next): array
    {
        usort($files, [$this, 'compareFiles']);

        return $next($files);
    }
}
