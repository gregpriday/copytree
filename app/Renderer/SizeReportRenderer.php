<?php

namespace App\Renderer;

use App\Services\ByteCounter;
use App\Transforms\FileTransformer;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Finder\SplFileInfo;

class SizeReportRenderer
{
    /**
     * Default limit for files to display.
     */
    protected int $defaultLimit = 20;

    /**
     * @param FileTransformer  $transformer  The file transformer instance.
     */
    public function __construct(protected FileTransformer $transformer)
    {
    }

    /**
     * Render a size report for the files, sorted by transformed output size.
     * This version builds the entire report in memory and outputs it at once,
     * with no progress or logging output.
     */
    public function render(array $files, OutputInterface $output, int $maxLines = 0, int $maxCharacters = 0, ?int $limit = null): void
    {
        if (empty($files)) {
            $output->writeln('<comment>No files to analyze.</comment>');
            return;
        }

        $limit = $limit ?? $this->defaultLimit;

        $fileSizes = [];
        foreach ($files as $file) {
            $fileSizes[$file->getRelativePathname()] = $this->getFileOutputSize($file, $maxLines, $maxCharacters);
        }

        // Sort files by total size (descending)
        uasort($fileSizes, function ($a, $b) {
            return $b['total_size'] <=> $a['total_size'];
        });

        // Calculate total size to use for percentages
        $totalAllFiles = array_sum(array_column($fileSizes, 'total_size'));
        $totalContentSize = array_sum(array_column($fileSizes, 'content_size'));

        // Limit the number of files shown
        $displayFiles = array_slice($fileSizes, 0, $limit, true);
        $displayedSize = array_sum(array_column($displayFiles, 'total_size'));

        // Calculate "other" files if limiting
        $otherSize = $totalAllFiles - $displayedSize;

        // Build report lines in an array
        $lines = [];
        $lines[] = '';
        $lines[] = '<fg=green;options=bold>File Size Report - Total: ' . ByteCounter::formatBytes($totalAllFiles) . '</>';
        $lines[] = '';
        $lines[] = sprintf(
            '<options=bold>%-60s %-10s %-8s</>',
            'File',
            'Size',
            '% of Total'
        );
        $lines[] = str_repeat('-', 80);

        foreach ($displayFiles as $file => $sizes) {
            $percentage = ($sizes['total_size'] / $totalAllFiles) * 100;

            // Skip files below 0.1% threshold for extremely large projects.
            if ($percentage < 0.1 && $limit > 10) {
                continue;
            }

            $filename = strlen($file) > 55 ? '...' . substr($file, -52) : $file;
            $sizeStr = ByteCounter::formatBytes($sizes['total_size']);
            $percentStr = $percentage >= 10 ?
                sprintf('%d%%', round($percentage)) :
                sprintf('%.1f%%', $percentage);

            $lines[] = sprintf(
                '%-60s %-10s %-8s',
                $filename,
                $sizeStr,
                $percentStr
            );
        }

        if ($otherSize > 0 && count($files) > $limit) {
            $otherCount = count($files) - count($displayFiles);
            $lines[] = str_repeat('-', 80);
            $lines[] = sprintf(
                '%-60s %-10s %-8s',
                sprintf('Other files (%d)', $otherCount),
                ByteCounter::formatBytes($otherSize),
                sprintf('%.1f%%', ($otherSize / $totalAllFiles) * 100)
            );
        }

        $lines[] = str_repeat('-', 80);
        $lines[] = sprintf(
            'Top %d files account for %.1f%% of total size',
            count($displayFiles),
            ($displayedSize / $totalAllFiles) * 100
        );
        $lines[] = sprintf(
            'Content: %s, XML overhead: %s',
            ByteCounter::formatBytes($totalContentSize),
            ByteCounter::formatBytes($totalAllFiles - $totalContentSize)
        );

        // Output the complete report at once.
        $output->writeln(implode("\n", $lines));
    }

    /**
     * Calculate the output size of a file after transformation.
     */
    private function getFileOutputSize(SplFileInfo $file, int $maxLines = 0, int $maxCharacters = 0): array
    {
        $relativePath = $file->getRelativePathname();
        $mimeType = mime_content_type($file->getRealPath());
        $fileSize = ByteCounter::formatBytes($file->getSize());
        $lines = count(file($file->getRealPath()));

        $xmlStart = sprintf(
            '<ct:file_contents path="%s" mime-type="%s" size="%s" lines="%d">',
            $relativePath,
            $mimeType,
            $fileSize,
            $lines
        );
        $xmlEnd = sprintf('</ct:file_contents> <!-- End of file: %s -->', $relativePath);

        $content = $this->transformer->transform($file);

        if ($maxLines > 0) {
            $linesArr = explode("\n", $content);
            if (count($linesArr) > $maxLines) {
                $content = implode("\n", array_slice($linesArr, 0, $maxLines))
                    ."\n\n... [truncated after {$maxLines} lines] ...";
            }
        }

        if ($maxCharacters > 0 && mb_strlen($content) > $maxCharacters) {
            $content = mb_substr($content, 0, $maxCharacters)
                ."\n\n... [truncated after {$maxCharacters} characters] ...";
        }

        $contentSize = strlen($content);
        $xmlSize = strlen($xmlStart) + strlen($xmlEnd) + 2;
        $totalSize = $contentSize + $xmlSize;

        return [
            'content_size' => $contentSize,
            'xml_size' => $xmlSize,
            'total_size' => $totalSize,
        ];
    }
}
