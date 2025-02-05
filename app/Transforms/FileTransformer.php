<?php

namespace App\Transforms;

use App\Pipeline\RulesetFilter;
use App\Transforms\Transformers\DefaultFileLoader;
use Illuminate\Support\Arr;
use InvalidArgumentException;
use Symfony\Component\Finder\SplFileInfo;

class FileTransformer
{
    /**
     * @var array Each config item must have 'rules' and 'transforms' keys.
     */
    protected array $configs;

    /**
     * @param  array  $configs  Transformation configuration.
     */
    public function __construct(array $configs)
    {
        $this->configs = $configs;
    }

    /**
     * Transform the file's content if it matches any config.
     *
     *
     * @throws InvalidArgumentException
     */
    public function transform(SplFileInfo $file): string
    {
        // Load the file content using the default loader transform.
        $content = (new DefaultFileLoader)->transform($file);

        // For each config, if the file matches the rules, apply the transforms.
        foreach ($this->configs as $config) {
            if (! isset($config['rules'], $config['transforms'])) {
                continue;
            }

            $filter = new RulesetFilter($config['rules'], [], []);
            if (! $filter->accept($file)) {
                continue;
            }

            $transforms = Arr::wrap($config['transforms']);
            if (! is_array($transforms)) {
                throw new InvalidArgumentException('Transforms must be a string or an array of strings.');
            }

            foreach ($transforms as $transformClass) {
                // Prepend namespace if not provided.
                if (strpos($transformClass, '\\') === false) {
                    $transformClass = 'App\\Transforms\\Transformers\\'.$transformClass;
                }
                if (! class_exists($transformClass)) {
                    throw new InvalidArgumentException("Transform class {$transformClass} not found.");
                }
                $transformer = new $transformClass;
                if (! ($transformer instanceof FileTransformerInterface)) {
                    throw new InvalidArgumentException("Transform class {$transformClass} must implement FileTransformInterface.");
                }
                $content = $transformer->transform($content);
            }
        }

        return $content;
    }
}
