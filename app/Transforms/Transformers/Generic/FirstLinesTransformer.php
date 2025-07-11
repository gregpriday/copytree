<?php

namespace App\Transforms\Transformers\Generic;

use App\Transforms\BaseTransformer;
use App\Transforms\FileTransformerInterface;
use Symfony\Component\Finder\SplFileInfo;

class FirstLinesTransformer extends BaseTransformer implements FileTransformerInterface
{
    /**
     * The number of lines to read from the files.
     */
    protected int $lines = 20;

    /**
     * Transform the file by returning its first N lines.
     * This method is optimized for large files by using streaming
     * to read only the necessary lines.
     *
     * @param  SplFileInfo|string  $input  The file or content to transform.
     * @return string The first N lines of the file.
     */
    public function transform(SplFileInfo|string $input): string
    {
        // If the input is already a string, handle it (e.g., split by newline and take first N lines)
        if (is_string($input)) {
            $inputLines = explode("\n", $input);
            $selectedLines = array_slice($inputLines, 0, $this->lines);

            return implode("\n", $selectedLines);
        }

        // Ensure SplFileInfo is a valid file
        $realPath = $input->getRealPath();
        if ($realPath === false || ! is_file($realPath)) {
            return '';
        }

        // Use the cacheTransformResult from BaseTransformer to cache the output
        return $this->cacheTransformResult($input, function () use ($realPath) {
            $handle = @fopen($realPath, 'r');
            if ($handle === false) {
                return '';
            }

            $outputLines = [];
            $count = 0;
            while (($line = fgets($handle)) !== false && $count < $this->lines) {
                $outputLines[] = rtrim($line, "\r\n");
                $count++;
            }
            fclose($handle);

            return implode("\n", $outputLines);
        });
    }
}
