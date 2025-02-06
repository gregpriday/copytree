<?php

namespace App\Pipeline\Stages;

use App\Pipeline\FilePipelineStageInterface;
use OpenAI\Laravel\Facades\OpenAI;
use RuntimeException;
use Symfony\Component\Finder\SplFileInfo;

class OpenAIFilterStage implements FilePipelineStageInterface
{
    protected string $description;

    protected int $previewLength;

    /**
     * Create a new OpenAIFilterStage.
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
     * Filter files using OpenAI.
     *
     * @param  array  $files  An array of Symfony Finder SplFileInfo objects.
     * @param  \Closure  $next  The next pipeline stage.
     * @return array The filtered array of files.
     *
     * @throws RuntimeException If the API call or response is invalid.
     */
    public function handle(array $files, \Closure $next): array
    {
        if (empty($files)) {
            return $next($files);
        }

        // Prepare file data for AI: for each file, include relative path and a preview of the content.
        $fileData = [];
        foreach ($files as $file) {
            /** @var SplFileInfo $file */
            $fileData[] = [
                'path' => $file->getRelativePathname(),
                'preview' => $this->getFilePreview($file),
            ];
        }

        // Create a JSON payload with the filtering description and the file list.
        $payload = [
            'description' => $this->description,
            'files' => $fileData,
        ];
        $promptText = json_encode($payload, JSON_PRETTY_PRINT);

        // Use a system prompt from your prompt file.
        $systemPrompt = file_get_contents(base_path('prompts/file-filter/system.txt'));

        try {
            $response = OpenAI::chat()->create([
                'model' => config('openai.model', 'gpt-4o'),
                'messages' => [
                    ['role' => 'system', 'content' => $systemPrompt],
                    ['role' => 'user',   'content' => $promptText],
                ],
                'temperature' => 0.3,
                'response_format' => [
                    'type' => 'json_object',
                ],
                'max_tokens' => 500,
            ]);
        } catch (\Exception $e) {
            throw new RuntimeException('OpenAI filtering failed: '.$e->getMessage());
        }

        $content = $response->choices[0]->message->content ?? '';
        $result = json_decode($content, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new RuntimeException('Invalid JSON response from OpenAI: '.json_last_error_msg());
        }

        if (! isset($result['files']) || ! is_array($result['files'])) {
            throw new RuntimeException('OpenAI response did not include a valid "files" array.');
        }

        $acceptedPaths = $result['files'];

        $filteredFiles = array_filter($files, function (SplFileInfo $file) use ($acceptedPaths) {
            return in_array($file->getRelativePathname(), $acceptedPaths);
        });

        return $next(array_values($filteredFiles));
    }

    /**
     * Get a preview of the file content.
     */
    protected function getFilePreview(SplFileInfo $file): string
    {
        $contents = file_get_contents($file->getRealPath());

        return mb_substr($contents, 0, $this->previewLength);
    }
}
