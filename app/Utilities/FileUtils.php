<?php

namespace App\Utilities;

use Symfony\Component\Finder\SplFileInfo;

class FileUtils
{
    /**
     * Count the number of lines in a file efficiently by reading it in chunks.
     *
     * @param string $filePath The path to the file.
     * @return int The number of lines, or -1 if the file cannot be opened.
     */
    public static function countLinesEfficiently(string $filePath): int
    {
        $handle = @fopen($filePath, 'r');
        if ($handle === false) {
            return -1; // Indicate failure; caller can handle this case.
        }

        $count = 0;
        $bufferSize = 8192; // 8KB chunks to balance memory and performance.

        while (!feof($handle)) {
            $chunk = fread($handle, $bufferSize);
            if ($chunk === false) {
                fclose($handle);
                return -1; // Read error.
            }
            $count += substr_count($chunk, "\n");
        }

        fclose($handle);
        
        // If the file doesn't end with a newline, we need to add 1 to the count
        // to account for the last line
        if ($count > 0) {
            $handle = @fopen($filePath, 'r');
            if ($handle !== false) {
                fseek($handle, -1, SEEK_END);
                $lastChar = fread($handle, 1);
                fclose($handle);
                if ($lastChar !== "\n") {
                    $count++;
                }
            }
        }
        
        return $count;
    }
} 