<?php

namespace App\Pipeline\Stages;

use App\Helpers\PrismHelper;
use App\Pipeline\FilePipelineStageInterface;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Log;
use Prism\Prism\ValueObjects\Messages\UserMessage;
use RuntimeException;
use Symfony\Component\Finder\SplFileInfo;
use Throwable;

class AIFilterStage implements FilePipelineStageInterface
{
    protected string $description;

    protected int $previewLength;

    /**
     * Create a new AIFilterStage.
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
     * Filter files using AI.
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

        // Prepare file data for API: each file's relative path and a content preview.
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
            // Get provider and model from config
            $provider = Config::get('ai.default_provider', 'openai');
            $modelSize = Config::get('ai.defaults.model_size_for_classification', 'medium');
            $model = Config::get("ai.providers.{$provider}.models.{$modelSize}", 'gpt-4o');

            // Get task-specific parameters from config
            $temperature = Config::get('ai.task_parameters.classification.temperature', 0.1);
            $maxTokens = Config::get('ai.task_parameters.classification.max_tokens', 1024);

            // Generate content using PrismHelper to handle Fireworks provider
            $response = PrismHelper::text($provider, $model)
                ->withSystemPrompt($systemPrompt)
                ->withMessages([new UserMessage($promptText)])
                ->usingTemperature($temperature)
                ->withMaxTokens($maxTokens)
                ->asText();

            // Retrieve the response text.
            $content = $response->text;
        } catch (\Exception $e) {
            throw new RuntimeException('AI filtering failed: '.$e->getMessage());
        }
        // Remove code fences if present (handle various fence formats)
        $content = trim($content);
        // Handle ```json, ```JSON, or just ```
        if (preg_match('/^```(?:json|JSON)?\s*\n(.*)\n```$/s', $content, $matches)) {
            $content = $matches[1];
        }

        $result = json_decode($content, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new RuntimeException('Invalid JSON response from AI: '.json_last_error_msg());
        }

        if (! isset($result['files']) || ! is_array($result['files'])) {
            throw new RuntimeException('AI response did not include a valid "files" array.');
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
     * Uses AI API to determine if a content item should be included based on content analysis
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

        try {
            // Get provider and model from config
            $provider = Config::get('ai.default_provider', 'openai');
            $modelSize = Config::get('ai.defaults.model_size_for_classification', 'medium');
            $model = Config::get("ai.providers.{$provider}.models.{$modelSize}", 'gpt-4o');

            // Get task-specific parameters from config
            $temperature = Config::get('ai.task_parameters.classification.temperature', 0.1);
            $maxTokens = Config::get('ai.task_parameters.classification.max_tokens', 300);

            // Make the API call using Prism
            $response = Prism::text()
                ->using($provider, $model)
                ->withSystemPrompt($systemPrompt)
                ->withMessages([new UserMessage($userPrompt)])
                ->usingTemperature($temperature)
                ->withMaxTokens($maxTokens)
                ->asText();

            // Process the response
            $result = $this->processResponse($response, $options);

            return $result;
        } catch (Throwable $e) {
            // Log the error but include the content by default in case of API errors
            Log::error('AI Filter failed: '.$e->getMessage());

            return true; // Include by default if the filter fails
        }
    }

    /**
     * Build the system prompt for the AI filter.
     */
    protected function buildSystemPrompt(array $options = []): string
    {
        return 'You are a file content analyzer. Analyze the given content and determine if it should be included based on the criteria provided.';
    }

    /**
     * Build the user prompt for the AI filter.
     */
    protected function buildUserPrompt(string $content, array $options = []): string
    {
        return "Analyze this content and determine if it should be included:\n\n".$content;
    }

    /**
     * Process the AI response.
     */
    protected function processResponse($response, array $options = []): bool
    {
        $responseText = $response->text;

        // Simple logic: if response contains "yes" or "include", return true
        return stripos($responseText, 'yes') !== false || stripos($responseText, 'include') !== false;
    }
}
