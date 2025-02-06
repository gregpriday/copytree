<?php

namespace App\Transforms\Transformers;

use App\Transforms\FileTransformerInterface;
use Illuminate\Support\Facades\File;
use Symfony\Component\Finder\SplFileInfo;

class DefaultFileLoader implements FileTransformerInterface
{
    /**
     * Maximum allowed characters before snipping occurs.
     */
    protected int $maxLength = 10000;

    /**
     * Transform the given input into a string.
     *
     * If the input is a string, it is returned unchanged.
     * If it is a file, the method determines its MIME type and delegates
     * the transformation as follows:
     *
     * - For images: uses ImageDescription.
     * - For PDFs: uses PDFToText.
     * - For convertible documents: uses DocumentToTextTransformer.
     * - Otherwise, falls back to reading the file directly, checking for binary content.
     */
    public function transform(SplFileInfo|string $input): string
    {
        if (is_string($input)) {
            return $input;
        }

        $filePath = $input->getRealPath();
        if (! $filePath || ! is_file($filePath)) {
            return '';
        }

        $mime = File::mimeType($filePath);

        // If the file is an image, delegate to ImageDescription transformer.
        if (str_starts_with($mime, 'image/')) {
            return app(ImageDescription::class)->transform($input);
        }

        // If the file is a PDF, delegate to PDFToText transformer.
        if ($mime === 'application/pdf') {
            return app(PDFToText::class)->transform($input);
        }

        // If the file is convertible (based on PandocConverter's criteria), delegate to DocumentToText transformer.
        if (DocumentToText::canConvert($input)) {
            return app(DocumentToText::class)->transform($input);
        }

        // Fallback: load the file content directly.
        $maxBytes = 5 * 1024 * 1024; // 5 MB in bytes
        $fileSize = $input->getSize();
        if ($fileSize > $maxBytes) {
            // Load only the first 5MB if the file is larger than 5MB.
            $content = file_get_contents($filePath, false, null, 0, $maxBytes)
                ."\n\n=== Only showing the first 5MB ===";
        } else {
            $content = file_get_contents($filePath);
        }

        if ($this->isBinaryContent($content)) {
            return '[Binary file - not displayed]';
        }

        return $content;
    }

    /**
     * Determine whether the given content should be considered binary.
     *
     * This heuristic reads up to the first 1024 bytes and calculates the ratio of printable characters.
     * If the ratio is below 90%, the content is considered binary.
     */
    protected function isBinaryContent(string $content): bool
    {
        $sampleLength = min(1024, strlen($content));
        $sample = substr($content, 0, $sampleLength);
        $printable = 0;
        $total = $sampleLength;

        // if the content is empty, it's not binary
        if ($total === 0) {
            return false;
        }

        for ($i = 0; $i < $sampleLength; $i++) {
            $char = $sample[$i];
            $ord = ord($char);
            if ($ord === 9 || $ord === 10 || $ord === 13 || ($ord >= 32 && $ord <= 126)) {
                $printable++;
            }
        }

        return ($printable / $total) < 0.9;
    }
}
