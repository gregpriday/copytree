<?php

namespace App\Services;

use App\Helpers\PrismHelper;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

class AIFilenameGenerator
{
    /**
     * Maximum number of files to consider for filename generation.
     */
    protected int $maxFiles = 200;

    /**
     * Maximum length (in characters) for the generated filename (before the extension).
     */
    protected int $maxFilenameLength = 90;

    /**
     * The AI provider to use.
     */
    protected string $provider;

    /**
     * The AI model to use.
     */
    protected string $model;

    /**
     * Create a new AIFilenameGenerator instance.
     */
    public function __construct()
    {
        // Use the provider and model from configuration
        $this->provider = config('ai.default_provider', 'fireworks');
        $this->model = config("ai.providers.{$this->provider}.models.medium");
    }

    /**
     * Generates a file name based on content.
     *
     * @param  string  $content  The file content to generate a name from
     * @param  string|null  $extension  Optional file extension (without the dot)
     * @return string The generated file name
     *
     * @throws RuntimeException if filename generation fails
     */
    public function generateFilename(string $content, ?string $extension = null): string
    {
        // Trim content if it's too long
        $trimmedContent = mb_substr($content, 0, 10000);

        // Build the prompt for filename generation
        $prompt = "Generate a concise, descriptive filename for the following content. The filename should be lowercase, use dashes or underscores instead of spaces, and be no more than 50 characters long. Do not include the file extension in your response.\n\nContent:\n{$trimmedContent}";

        try {
            // Make a request to AI for filename generation using Prism
            $response = PrismHelper::text($this->provider, $this->model)
                ->withPrompt($prompt)
                ->withMaxTokens(60)
                ->usingTemperature(0.2)
                ->asText();

            // Get the generated filename
            $filename = trim($response->text);

            // Clean up the filename
            $filename = preg_replace('/[^\w\-]/', '', $filename);
            $filename = strtolower($filename);

            // If the filename is empty or invalid, use a fallback
            if (empty($filename)) {
                $filename = 'generated-file-'.time();
            }

            // Append extension if provided
            if ($extension) {
                $filename .= '.'.$extension;
            }

            return $filename;
        } catch (Throwable $e) {
            Log::error('Filename generation failed: '.$e->getMessage());
            throw new RuntimeException('Failed to generate filename: '.$e->getMessage());
        }
    }

    /**
     * Generate a descriptive filename based on an array of files.
     *
     * Each file in the array is expected to be a SplFileInfo instance.
     *
     * @param  array  $files  The files to analyze.
     * @param  string|null  $outputDirectory  (Optional) Directory to check for filename uniqueness.
     * @return string The sanitized filename ending with .txt.
     *
     * @throws RuntimeException When no files are provided or the API call fails.
     */
    public function generateFilenameFromFiles(array $files, ?string $outputDirectory = null): string
    {
        if (empty($files)) {
            throw new RuntimeException('No files provided for filename generation');
        }

        // Limit the files array to avoid token issues.
        $files = array_slice($files, 0, $this->maxFiles);

        // Build a list of file paths.
        $filesList = '';
        if (count($files)) {
            $file = $files[0];
            // Remove the file's relative part from its full path to obtain the parent folder.
            $folder = str_replace($file->getRelativePathname(), '', $file->getPathname());
            $filesList .= 'Parent Folder: '.$folder."\n";
        }
        foreach ($files as $file) {
            $filesList .= '- '.$file->getRelativePathname()."\n";
        }

        // Build the prompt for filename generation.
        $prompt = "Generate a descriptive filename for the following set of files and return a structured JSON output with a 'filename' field:\n\n".$filesList;

        // Load the system prompt from the filename generator prompt file.
        $systemPromptPath = base_path('prompts/filename-generator/system.txt');
        if (! file_exists($systemPromptPath)) {
            throw new RuntimeException('System prompt for filename generation not found.');
        }
        $systemPrompt = file_get_contents($systemPromptPath);

        try {
            // Get task-specific parameters from config
            $temperature = config('ai.task_parameters.filename_generation.temperature', 0.3);
            $maxTokens = config('ai.task_parameters.filename_generation.max_tokens', 50);

            // Generate content using AI with JSON response format
            $response = PrismHelper::text($this->provider, $this->model)
                ->withSystemPrompt($systemPrompt)
                ->withPrompt($prompt)
                ->withMaxTokens($maxTokens)
                ->usingTemperature($temperature)
                ->asText();
        } catch (\Exception $e) {
            throw new RuntimeException('AI API call failed: '.$e->getMessage());
        }

        // Retrieve the structured JSON response.
        $content = $response->text;

        // Extract JSON from code fences if present
        if (preg_match('/```json\s*\n(.*?)\n```/s', $content, $matches)) {
            $content = $matches[1];
        }

        $data = json_decode($content, true);

        if (json_last_error() !== JSON_ERROR_NONE || ! isset($data['filename'])) {
            throw new RuntimeException('Invalid response from AI: '.json_last_error_msg());
        }

        $rawFilename = $data['filename'];

        return $this->sanitizeFilename($rawFilename, $outputDirectory);
    }

    /**
     * Sanitize and format the generated filename.
     *
     * Ensures the filename is in hyphen-case (only lowercase letters, numbers, and hyphens)
     * and appends a .txt extension. If an output directory is provided, it ensures uniqueness.
     *
     * @param  string  $filename  The raw filename to sanitize.
     * @param  string|null  $directory  (Optional) The output directory to check for existing files.
     * @return string The sanitized filename.
     */
    protected function sanitizeFilename(string $filename, ?string $directory = null): string
    {
        // Replace any non-alphanumeric characters with hyphens.
        $filename = preg_replace('/[^a-zA-Z0-9]+/', '-', $filename);
        // Convert to lowercase.
        $filename = strtolower($filename);
        // Replace multiple hyphens with a single hyphen.
        $filename = preg_replace('/-+/', '-', $filename);
        // Trim hyphens from the beginning and end.
        $filename = trim($filename, '-');
        // Limit the filename length.
        $filename = substr($filename, 0, $this->maxFilenameLength);

        $baseFilename = $filename;
        $filename = $filename.'.txt';

        // If an output directory is provided, ensure the filename is unique.
        if ($directory) {
            $counter = 2;
            while (file_exists($directory.DIRECTORY_SEPARATOR.$filename)) {
                $filename = $baseFilename.'-'.$counter.'.txt';
                $counter++;
            }
        }

        return $filename;
    }
}
