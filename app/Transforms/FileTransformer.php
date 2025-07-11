<?php

namespace App\Transforms;

use App\Events\TransformCompleteEvent;
use App\Transforms\Transformers\Loaders\FileLoader;
use GregPriday\GitIgnore\PatternConverter;
use InvalidArgumentException;
use Symfony\Component\Finder\SplFileInfo;

class FileTransformer implements FileTransformerInterface
{
    /**
     * @var array Each entry is a [regex_pattern, transformer_instance] pair
     */
    protected array $transformerMappings = [];

    /**
     * @var PatternConverter Converts glob patterns to regex
     */
    protected PatternConverter $patternConverter;

    /**
     * Constructor.
     *
     * @param  array  $configs  Transformation configuration.
     */
    public function __construct(array $configs)
    {
        $this->patternConverter = new PatternConverter;
        $this->buildTransformerMappings($configs);
    }

    /**
     * Build the transformer mappings from the configuration.
     *
     * @param  array  $configs  Configuration array
     */
    protected function buildTransformerMappings(array $configs): void
    {
        foreach ($configs as $config) {
            if (! isset($config['files'], $config['type'])) {
                continue;
            }

            // Get the transformer class
            $transformerClass = $config['type'];

            // Check if the transformer class uses dot notation (e.g., CSV.CSVFirstLinesTransformer)
            if (strpos($transformerClass, '\\') === false && strpos($transformerClass, '.') !== false) {
                // Convert dot notation to namespace (e.g., App\Transforms\Transformers\CSV\CSVFirstLinesTransformer)
                $transformerClass = 'App\\Transforms\\Transformers\\'.str_replace('.', '\\', $transformerClass);
            }

            if (! class_exists($transformerClass)) {
                throw new InvalidArgumentException("Transform class {$transformerClass} not found.");
            }

            // Create an instance of the transformer
            $transformer = new $transformerClass;
            if (! ($transformer instanceof FileTransformerInterface)) {
                throw new InvalidArgumentException("Transform class {$transformerClass} must implement FileTransformerInterface.");
            }

            // Process all file patterns (can be a string or array)
            $patterns = (array) $config['files'];
            foreach ($patterns as $pattern) {
                // Convert pattern with brace expansion to regex
                $regex = $this->patternConverter->patternToRegex($pattern);
                $this->transformerMappings[] = [$regex, $transformer];
            }
        }
    }

    /**
     * Transform the file's content if it matches any registered transformer.
     *
     * Applies the first transformer whose pattern matches the file's relative path.
     * If no transformation is applied, falls back to the default file loader.
     *
     * @param  SplFileInfo|string  $input  The file or content to transform.
     * @return string The transformed content.
     */
    public function transform(SplFileInfo|string $input): string
    {
        // If input is already a string, return it
        if (is_string($input)) {
            return $input;
        }

        $relativePath = $input->getRelativePathname();

        foreach ($this->transformerMappings as [$regex, $transformer]) {
            if (preg_match($regex, $relativePath)) {
                $result = $transformer->transform($input);
                // Dispatch event for completed transform
                event(new TransformCompleteEvent($transformer, $input, $result));

                return $result;
            }
        }

        // No transformer matched, use default file loader
        return (new FileLoader)->transform($input);
    }

    /**
     * Count the number of transforms that would be applied to the given files.
     *
     * @param  SplFileInfo[]  $files  Array of files.
     * @param  bool  $onlyHeavy  If true, only count transformers where isHeavy() returns true.
     * @param  bool  $includeCached  If false, skip transformers where isCached($file) returns true.
     * @return int The total count of applicable transforms.
     */
    public function countTransforms(array $files, bool $onlyHeavy = false, bool $includeCached = true): int
    {
        $count = 0;
        foreach ($files as $item) {
            $file = $item instanceof SplFileInfo ? $item : $item['file'];

            if (! ($file instanceof SplFileInfo)) {
                continue; // Skip non-SplFileInfo items
            }

            $relativePath = $file->getRelativePathname();

            foreach ($this->transformerMappings as [$regex, $transformer]) {
                if (preg_match($regex, $relativePath)) {
                    if ($onlyHeavy && (! method_exists($transformer, 'isHeavy') || ! $transformer->isHeavy())) {
                        continue;
                    }
                    if (! $includeCached && method_exists($transformer, 'isCached') && $transformer->isCached($file)) {
                        continue;
                    }
                    $count++;
                    break; // Only count one transformer per file
                }
            }
        }

        return $count;
    }

    /**
     * Get the transformer that would be applied to a file.
     *
     * @param  SplFileInfo  $file  The file to check.
     * @return string|null The transformer class name or null if no transformer applies.
     */
    public function getTransformerForFile(SplFileInfo $file): ?string
    {
        $relativePath = $file->getRelativePathname();

        foreach ($this->transformerMappings as [$regex, $transformer]) {
            if (preg_match($regex, $relativePath)) {
                // Return a short name for the transformer
                $className = get_class($transformer);
                
                // Remove namespace prefix for brevity
                if (str_starts_with($className, 'App\\Transforms\\Transformers\\')) {
                    $shortName = str_replace('App\\Transforms\\Transformers\\', '', $className);
                    // Further simplify common transformer names
                    $shortName = str_replace('\\', '.', $shortName);
                    
                    // Make names even shorter and clearer
                    $transformerAliases = [
                        'Images.ImageDescription' => 'image→text',
                        'Images.SvgDescription' => 'svg→text',
                        'Converters.PDFToText' => 'pdf→text',
                        'Converters.DocumentToText' => 'doc→text',
                        'Markdown.MarkdownLinkStripper' => 'md→strip-links',
                        'Markdown.MarkdownStripper' => 'md→strip',
                        'HTML.HTMLStripper' => 'html→text',
                        'Generic.FirstLinesTransformer' => 'first-lines',
                        'CSV.CSVFirstLinesTransformer' => 'csv-preview',
                        'Summarizers.CodeSummary' => 'code→summary',
                        'Summarizers.FileSummary' => 'file→summary',
                        'Summarizers.UnitTestSummary' => 'test→summary',
                    ];
                    
                    return $transformerAliases[$shortName] ?? $shortName;
                }
                
                return $className;
            }
        }

        return null;
    }
}
