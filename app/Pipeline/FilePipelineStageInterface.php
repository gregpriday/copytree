<?php

namespace App\Pipeline;

interface FilePipelineStageInterface
{
    /**
     * Process the given file collection.
     *
     * @param  array    $files  An array of file entries (e.g. ['path' => ..., 'file' => SplFileInfo])
     * @param  \Closure $next   The next stage in the pipeline.
     * @return array            The modified file collection.
     */
    public function handle(array $files, \Closure $next): array;
}
