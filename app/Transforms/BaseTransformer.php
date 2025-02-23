<?php

namespace App\Transforms;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use RuntimeException;
use Symfony\Component\Finder\SplFileInfo;

abstract class BaseTransformer
{
    /**
     * Retrieve content from the input.
     *
     * If the input is a SplFileInfo (a file), this reads its content.
     * If the input is already a string, it is returned directly.
     *
     * @throws RuntimeException If the file cannot be read.
     */
    protected function getContent(SplFileInfo|string $input): string
    {
        if ($input instanceof SplFileInfo) {
            try {
                return File::get($input->getRealPath());
            } catch (\Exception $e) {
                throw new RuntimeException('Unable to read file: '.$input->getRealPath());
            }
        }

        return $input;
    }

    /**
     * Check if the transformation result for the given file is already cached.
     *
     * This computes the MD5 hash of the file (using its full path) and looks up
     * the corresponding cache entry using a key derived from the calling class and file path.
     *
     * @param  SplFileInfo  $file  The file for which to check the cache.
     * @return bool True if a valid cached result exists, false otherwise.
     */
    public function isCached(SplFileInfo $file): bool
    {
        $realPath = $file->getRealPath();

        if (! $realPath || ! file_exists($realPath)) {
            return false;
        }

        $currentMd5 = md5_file($realPath);
        $cacheKey = 'transformer_result:'.md5(get_called_class().$realPath);

        $cached = Cache::get($cacheKey);

        return
            $cached &&
            isset($cached['md5'], $cached['result']) &&
            $cached['md5'] === $currentMd5;
    }

    /**
     * Cache the result of an expensive transformation for a given file.
     *
     * This helper computes the MD5 hash of the file (using its full path),
     * and uses the hash along with the file’s real path to store the transformation
     * result in the Laravel cache. If the file has not changed (the MD5 matches),
     * the cached result is returned.
     *
     * @param  SplFileInfo  $file  The file for which the transformation is done.
     * @param  callable  $callback  A callback that returns the transformation result.
     * @return string The cached (or newly computed) transformation result.
     */
    protected function cacheTransformResult(SplFileInfo $file, callable $callback): string
    {
        $realPath = $file->getRealPath();

        if (! $realPath || ! file_exists($realPath)) {
            // If the file path is not valid, simply execute the callback.
            return $callback();
        }

        // Compute the current MD5 hash of the file.
        $currentMd5 = md5_file($realPath);

        // Use get_called_class() to include the name of the calling class in the cache key.
        $cacheKey = 'transformer_result:'.md5(get_called_class().$realPath);

        // Check if we have a cached result and that the file has not changed.
        $cached = Cache::get($cacheKey);
        if (
            $cached &&
            isset($cached['md5'], $cached['result']) &&
            $cached['md5'] === $currentMd5
        ) {
            return $cached['result'];
        }

        // Otherwise, perform the transformation.
        $result = $callback();

        // Store the result along with the current MD5 hash in the cache (forever).
        Cache::forever($cacheKey, [
            'md5' => $currentMd5,
            'result' => $result,
        ]);

        return $result;
    }
}
