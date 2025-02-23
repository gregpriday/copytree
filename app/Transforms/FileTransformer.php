<?php

namespace App\Transforms;

use App\Events\TransformCompleteEvent;
use App\Pipeline\RulesetFilter;
use App\Transforms\Transformers\Loaders\FileLoader;
use Illuminate\Support\Arr;
use InvalidArgumentException;
use Symfony\Component\Finder\SplFileInfo;

class FileTransformer
{
    /**
     * @var array Each configuration item must have 'rules' and 'transforms' keys.
     */
    protected array $configs;

    /**
     * Constructor.
     *
     * @param  array  $configs  Transformation configuration.
     */
    public function __construct(array $configs)
    {
        $this->configs = $configs;
    }

    /**
     * Process all transform configurations for a given file.
     *
     * When $execute is true, actual transformations are applied to the file content.
     * When $execute is false, the method only simulates the transformation by dispatching events.
     * The event is dispatched with a "dryRun" flag equal to the negation of $execute.
     *
     * @param  SplFileInfo  $file  The file to process.
     * @param  bool  $execute  Whether to actually execute transforms.
     * @return string|null The transformed content if executed, or null otherwise.
     *
     * @throws InvalidArgumentException
     */
    private function processConfigs(SplFileInfo $file, bool $execute): ?string
    {
        $content = $file;
        foreach ($this->configs as $config) {
            if (! isset($config['rules'], $config['transforms'])) {
                continue;
            }
            $filter = new RulesetFilter($config['rules'], [], []);
            if (! $filter->accept($file)) {
                continue;
            }
            $transforms = Arr::wrap($config['transforms']);
            foreach ($transforms as $transformIdentifier) {
                $transformClass = 'App\\Transforms\\Transformers\\'.str_replace('.', '\\', $transformIdentifier);
                if (! class_exists($transformClass)) {
                    throw new InvalidArgumentException("Transform class {$transformClass} not found.");
                }
                $transformer = new $transformClass;
                if (! ($transformer instanceof FileTransformerInterface)) {
                    throw new InvalidArgumentException("Transform class {$transformClass} must implement FileTransformerInterface.");
                }
                if ($execute) {
                    $content = $transformer->transform($content);
                }

                // Dispatch event for completed transform.
                event(new TransformCompleteEvent($transformer, $file, $content));
            }
        }

        // If SplFileInfo is still present, return file contents.
        if ($content instanceof SplFileInfo) {
            return (new FileLoader)->transform($content);
        }

        return $content;
    }

    /**
     * Transform the file's content if it matches any configuration.
     *
     * Dispatches before and after events (with execute mode) and applies transformations.
     * If no transformation is applied, falls back to the default file loader.
     *
     * @param  SplFileInfo  $file  The file to transform.
     * @return string The transformed content.
     *
     * @throws InvalidArgumentException
     */
    public function transform(SplFileInfo $file): string
    {
        $content = $this->processConfigs($file, true);
        if (is_null($content)) {
            $content = (new FileLoader)->transform($file);
        }

        return $content;
    }

    /**
     * Count the number of transforms that would be applied to the given files.
     *
     * For each file in $files, if its filtering rules pass, count each applicable transformer.
     * Optionally restrict counting to only heavy transformers and/or skip transformers that are cached.
     *
     * @param  SplFileInfo[]  $files  Array of files.
     * @param  bool  $onlyHeavy  If true, only count transformers where isHeavy() returns true.
     * @param  bool  $includeCached  If false, skip transformers where isCached($file) returns true.
     * @return int The total count of applicable transforms.
     *
     * @throws InvalidArgumentException
     */
    public function countTransforms(array $files, bool $onlyHeavy = false, bool $includeCached = true): int
    {
        $count = 0;
        foreach ($files as $item) {
            $file = $item instanceof SplFileInfo ? $item : $item['file'];
            foreach ($this->configs as $config) {
                if (! isset($config['rules'], $config['transforms'])) {
                    continue;
                }
                $filter = new RulesetFilter($config['rules'], [], []);
                if (! $filter->accept($file)) {
                    continue;
                }
                $transforms = Arr::wrap($config['transforms']);
                foreach ($transforms as $transformIdentifier) {
                    $transformClass = 'App\\Transforms\\Transformers\\'.str_replace('.', '\\', $transformIdentifier);
                    if (! class_exists($transformClass)) {
                        throw new InvalidArgumentException("Transform class {$transformClass} not found.");
                    }
                    $transformer = new $transformClass;
                    if (! ($transformer instanceof FileTransformerInterface)) {
                        throw new InvalidArgumentException("Transform class {$transformClass} must implement FileTransformerInterface.");
                    }
                    if ($onlyHeavy && (! method_exists($transformer, 'isHeavy') || ! $transformer->isHeavy())) {
                        continue;
                    }
                    if (! $includeCached && method_exists($transformer, 'isCached') && $transformer->isCached($file)) {
                        continue;
                    }
                    $count++;
                }
            }
        }

        return $count;
    }
}
