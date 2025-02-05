<?php

namespace App\Transforms\Transformers;

use App\Transforms\FileTransformerInterface;
use RuntimeException;
use Spatie\PdfToText\Pdf;
use Symfony\Component\Finder\SplFileInfo;

class PDFToText implements FileTransformerInterface
{
    /**
     * Transform a PDF file into plain text.
     *
     * This transformer uses the spatie/pdf-to-text package (which wraps the pdftotext CLI tool)
     * to extract text from a PDF file. Make sure pdftotext is installed on your system (for macOS, you
     * can install it via Homebrew: "brew install poppler").
     *
     * @param  SplFileInfo|string  $input  A SplFileInfo instance or file path pointing to a PDF file.
     * @return string The extracted plain text.
     *
     * @throws RuntimeException If the file does not exist, is not readable, is not a PDF, or if the conversion fails.
     */
    public function transform(SplFileInfo|string $input): string
    {
        // Normalize input into a SplFileInfo object.
        if (! ($input instanceof SplFileInfo)) {
            $input = new SplFileInfo($input);
        }

        $realPath = $input->getRealPath();

        if ($realPath === false || ! file_exists($realPath) || ! is_readable($realPath)) {
            throw new RuntimeException("File '{$input->getPathname()}' does not exist or is not readable.");
        }

        // Ensure the file is a PDF (by extension).
        if (strtolower($input->getExtension()) !== 'pdf') {
            throw new RuntimeException("File '{$realPath}' is not a PDF file.");
        }

        try {
            // Use the spatie/pdf-to-text package to extract text.
            return Pdf::getText($realPath);
        } catch (\Exception $e) {
            throw new RuntimeException('Failed to convert PDF to text: '.$e->getMessage());
        }
    }
}
