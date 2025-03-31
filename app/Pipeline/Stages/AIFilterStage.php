<?php

namespace App\Pipeline\Stages;

use App\Pipeline\FilePipelineStageInterface;
use Gemini\Data\Content;
use Gemini\Laravel\Facades\Gemini;
use RuntimeException;
use Symfony\Component\Finder\SplFileInfo;
use Illuminate\Support\Facades\Log;
use Throwable;

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
            // Generate content using Gemini with the model optimized for classification tasks
            $response = Gemini::generativeModel(model: config('gemini.classification_model'))
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

    /**
     * Uses Gemini API to determine if a content item should be included based on content analysis
     *
     * @param  string  $content  The content to analyze
     * @param  array  $options  Additional options for filtering
     * @return bool True if the content should be included, false otherwise
     */
    protected function aiFilter(string $content, array $options = []): bool
    {
        // Generate a system prompt based on the filter configuration
        $systemPrompt = $this->buildSystemPrompt($options);

        // Generate a user prompt with the content to analyze
        $userPrompt = $this->buildUserPrompt($content, $options);

        // Set up a schema for structured output from Gemini
        $responseSchema = $this->buildResponseSchema();

        // Configure generation parameters
        $generationConfig = new GenerationConfig(
            maxOutputTokens: 300,
            temperature: 0.1,
            topP: 0.95,
            topK: 40
        );

        try {
            // Make the API call to Gemini
            $response = Gemini::generativeModel(model: config('gemini.classification_model'))
                ->withSystemInstruction(Content::parse($systemPrompt))
                ->withGenerationConfig($generationConfig)
                ->generateContent($userPrompt);

            // Process the response
            $result = $this->processResponse($response, $options);

            return $result;
        } catch (Throwable $e) {
            // Log the error but include the content by default in case of API errors
            Log::error('AI Filter failed: '.$e->getMessage());
            return true; // Include by default if the filter fails
        }
    }
}
