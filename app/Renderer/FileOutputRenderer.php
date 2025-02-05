<?php

namespace App\Renderer;

use App\Transforms\FileTransformer;
use Symfony\Component\Finder\SplFileInfo;
use DateTime;

class FileOutputRenderer
{
    protected FileTransformer $transformer;

    /**
     * Constructor.
     *
     * @param FileTransformer $transformer The file transformer instance
     */
    public function __construct(FileTransformer $transformer)
    {
        $this->transformer = $transformer;
    }

    /**
     * Render the file outputs.
     *
     * This method takes an array of SplFileInfo objects, applies the transformer
     * to get each file’s content, and outputs a formatted string including metadata.
     *
     * @param SplFileInfo[] $files    Array of files to render.
     * @param int           $maxLines Maximum number of lines to show per file (0 for unlimited).
     *
     * @return string The rendered output.
     */
    public function render(array $files, int $maxLines = 0): string
    {
        $output = [];

        foreach ($files as $file) {
            $relativePath = $file->getRelativePathname();
            $mimeType = mime_content_type($file->getRealPath());
            $size = $this->formatFileSize($file->getSize());
            $lines = count(file($file->getRealPath()));
            $modifiedTime = (new DateTime())->setTimestamp($file->getMTime())->format('Y-m-d H:i:s');

            // Start file block
            $output[] = sprintf(
                '<ct:file_contents path="%s" mime-type="%s" size="%s" lines="%d" modified="%s">',
                $relativePath,
                $mimeType,
                $size,
                $lines,
                $modifiedTime
            );

            // Get the transformed file content.
            $content = $this->transformer->transform($file);

            // If maxLines is set, limit the content preview.
            if ($maxLines > 0) {
                $linesArr = explode("\n", $content);
                if (count($linesArr) > $maxLines) {
                    $content = implode("\n", array_slice($linesArr, 0, $maxLines))
                        . "\n\n... [truncated after {$maxLines} lines] ...";
                }
            }

            $output[] = $content;
            $output[] = sprintf('</ct:file_contents> <!-- End of file: %s -->', $relativePath);
            $output[] = ''; // blank line between files
        }

        return implode("\n", $output);
    }

    /**
     * Format a file size in bytes into a human-readable string.
     *
     * @param int $bytes The size in bytes.
     * @return string The formatted file size.
     */
    protected function formatFileSize(int $bytes): string
    {
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $bytes = max($bytes, 0);
        $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
        $pow = min($pow, count($units) - 1);
        $bytes /= pow(1024, $pow);
        return round($bytes, 1) . ' ' . $units[$pow];
    }
}
