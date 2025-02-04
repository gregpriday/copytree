<?php

namespace App\Pipeline\Stages;

use App\Pipeline\FilePipelineStageInterface;
use App\Pipeline\FileLoader;
use App\Pipeline\RulesetFilter;
use App\Services\GitHubUrlHandler;
use Symfony\Component\Finder\SplFileInfo;
use RuntimeException;

class ExternalSourceStage implements FilePipelineStageInterface
{
    /**
     * External configuration items.
     *
     * Each item must be an associative array with the following keys:
     * - 'source': string (a GitHub URL or a local directory path)
     * - 'destination': string (a prefix to remap file paths from the external source)
     * - 'rules' (optional): array of include rule sets for filtering the external files
     *
     * @var array
     */
    protected array $externalItems;

    /**
     * Create a new ExternalSourceStage instance.
     *
     * @param array $externalItems External configuration items.
     */
    public function __construct(array $externalItems)
    {
        $this->externalItems = $externalItems;
    }

    /**
     * Process the external sources and merge their files with the local file set.
     *
     * For each external item:
     *   1. Validate that 'source' and 'destination' exist.
     *   2. Resolve the external source directory:
     *      - If the source starts with "https://github.com/", use GitHubUrlHandler.
     *      - Otherwise, assume a local directory.
     *   3. Load the external files via FileLoader.
     *   4. If external rules are provided, filter the external files using RulesetFilter.
     *   5. Remap each file’s relative path by prefixing with the destination.
     * Finally, merge the external files (converted into an associative array with keys
     * 'file' and 'path') with the incoming file set.
     *
     * The pipeline expects each file to be represented as an associative array:
     *   [ 'file' => (SplFileInfo instance), 'path' => (relative path) ]
     *
     * @param array    $files An array of local files (either raw SplFileInfo objects or
     *                        associative arrays with 'file' and 'path' keys).
     * @param \Closure $next  The next stage in the pipeline.
     *
     * @return array The merged file set.
     */
    public function handle(array $files, \Closure $next): array
    {
        $externalFiles = [];

        foreach ($this->externalItems as $item) {
            // Validate required keys.
            if (!isset($item['source'], $item['destination'])) {
                continue; // Skip invalid configuration items.
            }

            $source      = $item['source'];
            $destination = rtrim($item['destination'], '/') . '/';
            $rules       = $item['rules'] ?? [];

            // Resolve external source.
            if (str_starts_with($source, 'https://github.com/')) {
                $handler = new GitHubUrlHandler($source);
                $externalPath = $handler->getFiles();
            } else {
                if (!is_dir($source)) {
                    continue; // Skip if the local external directory does not exist.
                }
                $externalPath = realpath($source);
            }

            // Load external files using the FileLoader.
            $loader = new FileLoader($externalPath);
            $filesFromSource = $loader->loadFiles();

            // If filtering rules are provided for the external source, apply them.
            if (!empty($rules)) {
                $filter = new RulesetFilter($rules, [], []); // globalExcludeRules and always are empty here.
                $filesFromSource = array_filter($filesFromSource, function (SplFileInfo $file) use ($filter) {
                    return $filter->accept($file);
                });
            }

            // Remap each external file’s relative path by prefixing with the destination.
            $filesFromSource = array_map(function (SplFileInfo $file) use ($destination) {
                return [
                    'file' => $file,
                    'path' => $destination . $file->getRelativePathname(),
                ];
            }, $filesFromSource);

            // Merge external files.
            $externalFiles = array_merge($externalFiles, $filesFromSource);
        }

        // Normalize the local file set.
        // If local files are provided as raw SplFileInfo objects, convert them.
        $localFiles = array_map(function ($item) {
            if ($item instanceof SplFileInfo) {
                return [
                    'file' => $item,
                    'path' => $item->getRelativePathname(),
                ];
            }
            return $item;
        }, $files);

        // Merge local and external files.
        $merged = array_merge($localFiles, $externalFiles);

        return $next($merged);
    }
}
