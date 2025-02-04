<?php

namespace App\Pipeline\Stages;

use App\Pipeline\FilePipelineStageInterface;
use App\Services\JinaCodeSearch;
use Symfony\Component\Finder\SplFileInfo;
use RuntimeException;

class JinaSearchStage implements FilePipelineStageInterface
{
    /**
     * The Jina service instance.
     *
     * @var JinaCodeSearch
     */
    protected JinaCodeSearch $jina;

    /**
     * The natural language search query.
     *
     * @var string
     */
    protected string $query;

    /**
     * Create a new JinaSearchStage instance.
     *
     * @param JinaCodeSearch $jina  The fully configured Jina service.
     * @param string         $query The natural language search query.
     */
    public function __construct(JinaCodeSearch $jina, string $query)
    {
        $this->jina = $jina;
        $this->query = $query;
    }

    /**
     * Process the incoming files through Jina semantic search filtering.
     *
     * This stage:
     * 1. Converts each incoming SplFileInfo into an associative array with keys:
     *    - 'path' => the file's relative path (using getRelativePathname())
     *    - 'file' => the SplFileInfo object.
     * 2. Passes the converted array to the Jina service's searchFiles() method.
     * 3. Collects the relative paths of files that meet the relevancy threshold.
     * 4. Filters the original file set, keeping only files whose relative path is accepted.
     *
     * @param array    $files An array of Symfony Finder SplFileInfo objects.
     * @param \Closure $next  The next stage in the pipeline.
     *
     * @return array The filtered array of SplFileInfo objects.
     *
     * @throws RuntimeException If the Jina service call fails.
     */
    public function handle(array $files, \Closure $next): array
    {
        // If there are no files, just pass them along.
        if (empty($files)) {
            return $next($files);
        }

        // Convert each file to an associative array with 'path' and 'file' keys.
        $documents = array_map(function (SplFileInfo $file) {
            return [
                'path' => $file->getRelativePathname(),
                'file' => $file,
            ];
        }, $files);

        // Call the Jina service to search and rank the files.
        $result = $this->jina->searchFiles($documents, $this->query);

        // Expect the result to be structured as:
        // [
        //    'files' => [
        //         [
        //             'file' => 'relative/path/to/file.ext',
        //             'relevance_score' => 0.XX,
        //             'above_threshold' => true|false,
        //         ],
        //         ...
        //    ],
        //    'total_tokens' => <int>,
        // ]
        if (!isset($result['files']) || !is_array($result['files'])) {
            throw new RuntimeException('Invalid result returned from Jina service.');
        }

        // Build a list of accepted file relative paths.
        $acceptedPaths = [];
        foreach ($result['files'] as $entry) {
            if (!empty($entry['above_threshold']) && isset($entry['file'])) {
                $acceptedPaths[] = $entry['file'];
            }
        }

        // Filter the original array of SplFileInfo objects by comparing the relative path.
        $filteredFiles = array_filter($files, function (SplFileInfo $file) use ($acceptedPaths) {
            return in_array($file->getRelativePathname(), $acceptedPaths, true);
        });

        // Pass the filtered file set to the next pipeline stage.
        return $next(array_values($filteredFiles));
    }
}
