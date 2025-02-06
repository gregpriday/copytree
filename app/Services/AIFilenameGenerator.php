<?php

namespace App\Services;

use OpenAI\Laravel\Facades\OpenAI;
use RuntimeException;

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
     * The OpenAI model to use.
     */
    protected string $model;

    /**
     * Create a new AI filename generator instance.
     */
    public function __construct()
    {
        // Use the configured model or fall back to a default.
        $this->model = config('openai.model', 'gpt-4o');
    }

    /**
     * Generate a descriptive filename based on an array of files.
     *
     * Each file in the array is expected to be an associative array with at least a 'path' key.
     *
     * @param  array  $files  The files to analyze.
     * @param  string|null  $outputDirectory  (Optional) Directory to check for filename uniqueness.
     * @return string The sanitized filename ending with .txt.
     *
     * @throws RuntimeException When no files are provided or the API call fails.
     */
    public function generateFilename(array $files, ?string $outputDirectory = null): string
    {
        if (empty($files)) {
            throw new RuntimeException('No files provided for filename generation');
        }

        // Limit the files array to the maximum allowed to avoid token issues.
        $files = array_slice($files, 0, $this->maxFiles);

        // Prepare a list of file paths.
        $filesList = '';
        foreach ($files as $file) {
            // Expect each file to have a 'path' key.
            $filesList .= '- '.$file['path']."\n";
        }

        // Build the prompt for filename generation.
        $prompt = "Generate a descriptive filename for the following set of files:\n\n".$filesList;

        // Load the system prompt from the filename generator prompt file.
        $systemPrompt = file_get_contents(base_path('prompts/filename-generator/system.txt'));

        $response = OpenAI::chat()->create([
            'model' => $this->model,
            'messages' => [
                ['role' => 'system', 'content' => $systemPrompt],
                ['role' => 'user', 'content' => $prompt],
            ],
            'temperature' => 0.1,
            'response_format' => [
                'type' => 'json_object',
            ],
            'max_tokens' => 120,
        ]);

        // Decode the response expecting a JSON with a "filename" key.
        $content = $response->choices[0]->message->content ?? '';
        $data = json_decode($content, true);

        if (json_last_error() !== JSON_ERROR_NONE || ! isset($data['filename'])) {
            throw new RuntimeException('Invalid response from OpenAI: '.json_last_error_msg());
        }

        $rawFilename = $data['filename'];

        return $this->sanitizeFilename($rawFilename, $outputDirectory);
    }

    /**
     * Sanitize and format the generated filename.
     *
     * Ensures the filename is in hyphen-case, only contains lowercase letters, numbers, and hyphens,
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
