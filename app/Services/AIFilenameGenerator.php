<?php

namespace App\Services;

use Gemini\Data\Content;
use Gemini\Data\GenerationConfig;
use Gemini\Data\Schema;
use Gemini\Enums\DataType;
use Gemini\Enums\ResponseMimeType;
use Gemini\Laravel\Facades\Gemini;
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
     * The Gemini model to use.
     */
    protected string $model;

    /**
     * Create a new AI filename generator instance.
     */
    public function __construct()
    {
        // Use the Gemini model defined in config('gemini.model')
        $this->model = config('gemini.model', 'gemini-pro');
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
    public function generateFilename(array $files, ?string $outputDirectory = null): string
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
            // Remove the file’s relative part from its full path to obtain the parent folder.
            $folder = str_replace($file->getRelativePathname(), '', $file->getPathname());
            $filesList .= 'Parent Folder: '.$folder."\n";
        }
        foreach ($files as $file) {
            $filesList .= '- '.$file->getRelativePathname()."\n";
        }

        // Build the prompt for filename generation.
        $prompt = "Generate a descriptive filename for the following set of files and return a structured JSON output:\n\n".$filesList;

        // Load the system prompt from the filename generator prompt file.
        $systemPromptPath = base_path('prompts/filename-generator/system.txt');
        if (! file_exists($systemPromptPath)) {
            throw new RuntimeException('System prompt for filename generation not found.');
        }
        $systemPrompt = file_get_contents($systemPromptPath);

        // Configure Gemini to return structured JSON output.
        $generationConfig = new GenerationConfig(
            responseMimeType: ResponseMimeType::APPLICATION_JSON,
            responseSchema: new Schema(
                type: DataType::OBJECT,
                properties: [
                    'filename' => new Schema(type: DataType::STRING),
                ]
            )
        );

        try {
            // Generate content using Gemini with structured output.
            $response = Gemini::generativeModel(model: $this->model)
                ->withSystemInstruction(Content::parse($systemPrompt))
                ->withGenerationConfig($generationConfig)
                ->generateContent($prompt);
        } catch (\Exception $e) {
            throw new RuntimeException('Gemini API call failed: '.$e->getMessage());
        }

        // Retrieve the structured JSON response.
        $content = $response->text() ?? '';
        $data = json_decode($content, true);

        if (json_last_error() !== JSON_ERROR_NONE || ! isset($data['filename'])) {
            throw new RuntimeException('Invalid response from Gemini: '.json_last_error_msg());
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
