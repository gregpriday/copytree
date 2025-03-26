<?php

namespace App\Transforms\Transformers\CSV;

use App\Transforms\BaseTransformer;
use App\Transforms\FileTransformerInterface;
use Symfony\Component\Finder\SplFileInfo;

class CSVFirstLinesTransformer extends BaseTransformer implements FileTransformerInterface
{
    /**
     * The number of lines to read from CSV files
     */
    protected int $lines = 20;

    /**
     * Determine if this transformer supports the given file.
     *
     * @param  SplFileInfo  $file  The file to check.
     * @return bool True if the file is a CSV, false otherwise.
     */
    public function supports(SplFileInfo $file): bool
    {
        return $file->getExtension() === 'csv';
    }

    /**
     * Transform the CSV file by returning its first N lines.
     * This method is optimized for large files by using streaming
     * to read only the necessary lines.
     *
     * @param  SplFileInfo|string  $input  The CSV file or content to transform.
     * @return string The first N lines of the file.
     */
    public function transform(SplFileInfo|string $input): string
    {
        // If the input is already a string, return it
        if (is_string($input)) {
            return $input;
        }

        $handle = fopen($input->getRealPath(), 'r');
        if ($handle === false) {
            return ''; // Return empty string on failure
        }

        $lines = [];
        $count = 0;
        while (($line = fgets($handle)) !== false && $count < $this->lines) {
            $lines[] = rtrim($line, "\r\n"); // Remove trailing newlines
            $count++;
        }
        fclose($handle);

        return implode("\n", $lines); // Use consistent line endings
    }
}
