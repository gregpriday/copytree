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
        if (strpos($mime, 'image/') === 0) {
            $transformer = new ImageDescription;

            return $transformer->transform($input);
        }

        // If the file is a PDF, delegate to PDFToText transformer.
        if ($mime === 'application/pdf') {
            $transformer = new PDFToText;

            return $transformer->transform($input);
        }

        // If the file is convertible (based on PandocConverter's criteria), delegate to DocumentToTextTransformer.
        if (DocumentToText::canConvert($input)) {
            $transformer = new DocumentToText;

            return $transformer->transform($input);
        }

        // Fallback: load the file content directly.
        $content = File::get($filePath);

        if ($this->isBinaryContent($content)) {
            return '[Binary file - not displayed]';
        }

        if (mb_strlen($content) > $this->maxLength) {
            $snipped = mb_substr($content, 0, $this->maxLength);
            $snipped .= "\n\n... [truncated after {$this->maxLength} characters] ...";

            return $snipped;
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
