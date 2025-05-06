<?php

namespace App\Transforms\Transformers\Images;

use App\Transforms\BaseTransformer;
use App\Transforms\FileTransformerInterface;
use RuntimeException;
use Symfony\Component\Finder\SplFileInfo;

/**
 * SvgDescription
 *
 * This transformer is dedicated to processing SVG files. Rather than using getimagesize()
 * (which does not work for SVGs), it loads the SVG via SimpleXML to extract key attributes
 * such as width, height, and (optionally) a title. It then returns a concise text description.
 *
 * The result is cached based on the file's MD5 hash to avoid redundant processing.
 */
class SvgDescription extends BaseTransformer implements FileTransformerInterface
{
    /**
     * Transform an SVG file into a concise text description.
     *
     * This method expects a SplFileInfo instance. It will attempt to load the SVG,
     * extract attributes (width, height, viewBox, and title) and return a description
     * such as "SVG vector graphic titled 'Icon' (dimensions: 100px x 100px)".
     *
     * @param  SplFileInfo|string  $input  The SVG file as a SplFileInfo or a string (not supported).
     * @return string The generated description.
     *
     * @throws RuntimeException If the input is not a SplFileInfo or if parsing fails.
     */
    public function transform(SplFileInfo|string $input): string
    {
        if (! $input instanceof SplFileInfo) {
            throw new RuntimeException('SvgDescription transformer expects a SplFileInfo instance.');
        }

        $filePath = $input->getRealPath();
        if (! $filePath || ! file_exists($filePath)) {
            throw new RuntimeException("SVG file not found at {$filePath}");
        }

        // Use caching to avoid redundant SVG parsing.
        return $this->cacheTransformResult($input, function () use ($input, $filePath) {
            // Load the SVG file using SimpleXML.
            $svg = @simplexml_load_file($filePath);
            if ($svg === false) {
                // Log a warning instead of throwing an exception
                if (class_exists('\Illuminate\Support\Facades\Log')) {
                    \Illuminate\Support\Facades\Log::warning("Unable to parse SVG file, skipping: {$filePath}");
                } else {
                    // Fallback to standard PHP error log if Log facade isn't available
                    error_log("Warning: Unable to parse SVG file, skipping: {$filePath}");
                }

                // Return a placeholder string to indicate failure for this file
                return "[SVG parsing failed: {$input->getRelativePathname()}]";
            }

            // Retrieve attributes from the root <svg> element.
            $attributes = $svg->attributes();
            $width = trim((string) ($attributes->width ?? ''));
            $height = trim((string) ($attributes->height ?? ''));

            // If width or height are missing, try to use the viewBox attribute.
            if ((empty($width) || empty($height)) && ! empty($attributes->viewBox)) {
                // viewBox is usually formatted as "min-x min-y width height"
                $viewBoxParts = preg_split('/[\s,]+/', trim((string) $attributes->viewBox));
                if (count($viewBoxParts) === 4) {
                    if (empty($width)) {
                        $width = $viewBoxParts[2];
                    }
                    if (empty($height)) {
                        $height = $viewBoxParts[3];
                    }
                }
            }

            // Optionally, retrieve a <title> element if it exists.
            $title = '';
            if (isset($svg->title)) {
                $title = trim((string) $svg->title);
            }

            // Build a description string.
            $description = 'SVG vector graphic';
            if (! empty($title)) {
                $description .= " titled '{$title}'";
            }
            if (! empty($width) && ! empty($height)) {
                $description .= " (dimensions: {$width} x {$height})";
            }

            return $description;
        });
    }
}
