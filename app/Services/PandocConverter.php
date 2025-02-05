<?php

namespace App\Services;

use Illuminate\Support\Facades\File;
use RuntimeException;
use Symfony\Component\Finder\SplFileInfo;
use Symfony\Component\Process\Process;

class PandocConverter
{
    /**
     * A mapping of input MIME types to the desired Pandoc conversion output format.
     */
    protected static $mimeOutputFormats = [
        // Word processing documents
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'plain',
        'application/msword' => 'plain',
        'application/vnd.oasis.opendocument.text' => 'plain',

        // Spreadsheets
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'csv',
        'application/vnd.ms-excel' => 'csv',
        'application/vnd.oasis.opendocument.spreadsheet' => 'csv',

        // Presentations
        'application/vnd.openxmlformats-officedocument.presentationml.presentation' => 'plain',
        'application/vnd.ms-powerpoint' => 'plain',
        'application/vnd.oasis.opendocument.presentation' => 'plain',

        // RTF
        'application/rtf' => 'plain',
    ];

    /**
     * Convert a document to plain text or CSV using Pandoc.
     *
     * This service uses Pandoc to convert various document formats to a text-based format.
     * For word processing documents (e.g. DOCX, DOC, ODT), the output will be plain text.
     * For spreadsheets (e.g. XLSX, XLS, ODS), the output will be CSV.
     * Formats that are already plain text (like text/plain, text/markdown, etc.) are returned unmodified.
     *
     * @param  string  $inputFile  The full path to the input document.
     * @return string The converted text (plain text or CSV), or the original file content if no conversion is needed.
     *
     * @throws RuntimeException If Pandoc is not installed, the input file does not exist,
     *                          or the conversion fails.
     */
    public function convertToText(SplFileInfo $inputFile): string
    {
        $this->ensurePandocIsInstalled();

        if (! File::exists($inputFile) || ! File::isReadable($inputFile)) {
            throw new RuntimeException("Input file '{$inputFile}' does not exist or is not readable.");
        }

        $mimeType = File::mimeType($inputFile);

        // If the file's MIME type is marked as "no conversion needed", return the file contents directly.
        if (! array_key_exists($mimeType, self::$mimeOutputFormats)) {
            return File::get($inputFile);
        }

        // Determine the output format from the mapping.
        if (array_key_exists($mimeType, self::$mimeOutputFormats)) {
            $outputFormat = self::$mimeOutputFormats[$mimeType];
        } else {
            throw new RuntimeException("Unsupported document type: {$mimeType}");
        }

        // Build the Pandoc command.
        // Pandoc writes the conversion output to STDOUT if no output file is specified.
        $command = ['pandoc', '--to', $outputFormat, $inputFile];

        $process = new Process($command);
        $process->run();

        if (! $process->isSuccessful()) {
            throw new RuntimeException('Pandoc conversion failed: '.$process->getErrorOutput());
        }

        return $process->getOutput();
    }

    public static function canConvert(SplFileInfo $inputFile): bool
    {
        $mime = File::mimeType($inputFile);

        return array_key_exists($mime, self::$mimeOutputFormats);
    }

    /**
     * Ensure that Pandoc is installed and available in the system's PATH.
     *
     * This method runs "pandoc --version" and checks for a successful response.
     *
     * @throws RuntimeException If Pandoc is not installed.
     */
    protected function ensurePandocIsInstalled(): void
    {
        $process = new Process(['pandoc', '--version']);
        $process->run();

        if (! $process->isSuccessful()) {
            throw new RuntimeException(
                'Pandoc is not installed or not available in your PATH. '.
                "Please install it using Homebrew: 'brew install pandoc'"
            );
        }
    }
}
