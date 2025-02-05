<?php

namespace App\Utilities;

use DirectoryIterator;

class TempFileManager
{
    private const MAX_AGE_MINUTES = 15;

    private const PREFIX = 'ctree_output_';

    /**
     * Get the temporary directory for storing copytree output files.
     *
     * @return string The full path to the temporary directory.
     */
    public static function getTempDir(): string
    {
        $baseDir = sys_get_temp_dir();
        $ctreeDir = $baseDir.DIRECTORY_SEPARATOR.'ctree';

        if (! is_dir($ctreeDir)) {
            mkdir($ctreeDir, 0777, true);
        }

        return $ctreeDir;
    }

    /**
     * Create a temporary file with the given content.
     *
     * Generates a filename using a timestamp and a hash of the content.
     *
     * @param  string  $content  The content to save in the temporary file.
     * @return string The full path to the created temporary file.
     */
    public static function createTempFile(string $content): string
    {
        $tempDir = self::getTempDir();
        $timestamp = date('Y-m-d_H-i-s');
        $hash = substr(hash('sha256', $content.uniqid()), 0, 16);
        $filename = self::PREFIX.$timestamp.'_'.$hash.'.txt';
        $filepath = $tempDir.DIRECTORY_SEPARATOR.$filename;

        file_put_contents($filepath, $content);

        return $filepath;
    }

    /**
     * Remove temporary files older than the maximum age.
     *
     * Scans the temporary directory and deletes files whose names start with the
     * defined prefix and have a modification time older than the specified maximum.
     */
    public static function cleanOldFiles(): void
    {
        $tempDir = self::getTempDir();
        $maxAge = time() - (self::MAX_AGE_MINUTES * 60);

        foreach (new DirectoryIterator($tempDir) as $fileInfo) {
            if (
                $fileInfo->isFile() &&
                str_starts_with($fileInfo->getFilename(), self::PREFIX) &&
                $fileInfo->getMTime() < $maxAge
            ) {
                unlink($fileInfo->getPathname());
            }
        }
    }
}
