<?php

namespace App\Pipeline\Stages;

use App\Pipeline\FilePipelineStageInterface;
use Gemini\Data\Content;
use Gemini\Laravel\Facades\Gemini;
use RuntimeException;
use Symfony\Component\Finder\SplFileInfo;

class AIFilterStage implements FilePipelineStageInterface
{
    protected string $description;

    protected int $previewLength;

    /**
     * Create a new GeminiFilterStage.
     *
     * @param  string  $description  The natural language description to filter files.
     * @param  int  $previewLength  Optional maximum preview length (default 450).
     */
    public function __construct(string $description, int $previewLength = 450)
    {
        $this->description = $description;
        $this->previewLength = $previewLength;
    }

    /**
     * Filter files using Gemini.
     *
     * @param  array  $files  An array of Symfony Finder SplFileInfo objects.
     * @param  \Closure  $next  The next stage in the pipeline.
     * @return array The filtered array of files.
     *
     * @throws RuntimeException If the API call or response is invalid.
     */
    public function handle(array $files, \Closure $next): array
    {
        if (empty($files)) {
            return $next($files);
        }

        // Prepare file data for Gemini: each file's relative path and a content preview.
        $fileData = [];
        foreach ($files as $file) {
            /** @var SplFileInfo $file */
            $fileData[] = [
                'path' => $file->getRelativePathname(),
                'preview' => $this->getFilePreview($file),
            ];
        }

        // Build a JSON payload containing the description and file data.
        $payload = [
            'description' => $this->description,
            'files' => $fileData,
        ];
        $promptText = json_encode($payload, JSON_PRETTY_PRINT);

        // Load the system prompt for file filtering.
        $systemPrompt = file_get_contents(base_path('prompts/file-filter/system.txt'));
        if ($systemPrompt === false) {
            throw new RuntimeException('Failed to load system prompt from prompts/file-filter/system.txt');
        }

        try {
            // Generate content using Gemini.
            $response = Gemini::generativeModel(model: config('gemini.model'))
                ->withSystemInstruction(Content::parse($systemPrompt))
                ->generateContent($promptText);
        } catch (\Exception $e) {
            throw new RuntimeException('Gemini filtering failed: '.$e->getMessage());
        }

        // Retrieve the response text.
        $content = $response->text() ?? '';
        // Remove code fences if present.
        $content = preg_replace('/^```json(.*)```$/s', '$1', $content);

        $result = json_decode($content, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new RuntimeException('Invalid JSON response from Gemini: '.json_last_error_msg());
        }

        if (! isset($result['files']) || ! is_array($result['files'])) {
            throw new RuntimeException('Gemini response did not include a valid "files" array.');
        }

        $acceptedPaths = $result['files'];

        // Filter the files to only those whose relative path is in the accepted list.
        $filteredFiles = array_filter($files, function (SplFileInfo $file) use ($acceptedPaths) {
            return in_array($file->getRelativePathname(), $acceptedPaths);
        });

        return $next(array_values($filteredFiles));
    }

    /**
     * Get a preview of the file content.
     *
     * @param  SplFileInfo  $file  The file to preview.
     * @return string The first N characters of the file content.
     */
    protected function getFilePreview(SplFileInfo $file): string
    {
        $contents = file_get_contents($file->getRealPath());

        return mb_substr($contents, 0, $this->previewLength);
    }
}
