<?php

namespace App\Transforms\Transformers\Summarizers;

use App\Transforms\BaseTransformer;
use App\Transforms\FileTransformerInterface;
use App\Transforms\SlowTransformerTrait;
use App\Transforms\Transformers\Loaders\FileLoader;
use Gemini\Data\Content;
use Gemini\Data\GenerationConfig;
use Gemini\Data\Schema;
use Gemini\Enums\DataType;
use Gemini\Enums\ResponseMimeType;
use Gemini\Laravel\Facades\Gemini;
use Illuminate\Support\Facades\File;
use RuntimeException;
use Symfony\Component\Finder\SplFileInfo;

class FileSummary extends BaseTransformer implements FileTransformerInterface
{
    use SlowTransformerTrait;

    /**
     * Transform the given file into a concise summary using Gemini.
     *
     * If the file is not a text file (determined by its MIME type), this transformer
     * falls back to the default file loader.
     *
     * @throws RuntimeException If the file is not a SplFileInfo instance, the system prompt is missing,
     *                          the API call fails, or no summary is returned.
     */
    public function transform(SplFileInfo|string $input): string
    {
        if (! ($input instanceof SplFileInfo)) {
            throw new RuntimeException('FileSummary transformer expects a SplFileInfo instance.');
        }

        // Determine the MIME type of the file.
        $mimeType = File::mimeType($input->getRealPath());

        // Only summarize text files. For non-text files, fall back to the default loader.
        if (strpos($mimeType, 'text/') !== 0) {
            return (new FileLoader)->transform($input);
        }

        // Read the file content.
        $content = File::get($input->getRealPath());

        // Optionally limit the content length to avoid huge requests.
        $maxLength = 2000; // adjust as needed
        if (strlen($content) > $maxLength) {
            $content = substr($content, 0, $maxLength);
        }

        // Use caching so that if the file hasn't changed, we don't call Gemini again.
        return $this->cacheTransformResult($input, function () use ($content) {
            // Load the system prompt for file summarization.
            $systemPromptPath = base_path('prompts/file-summary/system.txt');
            if (! File::exists($systemPromptPath)) {
                throw new RuntimeException('System prompt for file summary not found.');
            }
            $systemPrompt = File::get($systemPromptPath);

            // Build the prompt.
            $prompt = "Please provide a concise summary for the following file content:\n\n".$content;

            // Configure Gemini to return structured JSON output with a "summary" field.
            $generationConfig = new GenerationConfig(
                responseMimeType: ResponseMimeType::APPLICATION_JSON,
                responseSchema: new Schema(
                    type: DataType::OBJECT,
                    properties: [
                        'summary' => new Schema(type: DataType::STRING),
                    ]
                )
            );

            try {
                $response = Gemini::generativeModel(model: config('gemini.model'))
                    ->withSystemInstruction(Content::parse($systemPrompt))
                    ->withGenerationConfig($generationConfig)
                    ->generateContent($prompt);
            } catch (\Exception $e) {
                throw new RuntimeException('Gemini API call failed: '.$e->getMessage());
            }

            $contentText = $response->text() ?? '';
            $data = json_decode($contentText, true);

            if (json_last_error() !== JSON_ERROR_NONE || ! isset($data['summary'])) {
                throw new RuntimeException('Invalid response from Gemini: '.json_last_error_msg());
            }

            $summary = $data['summary'];
            if (empty($summary)) {
                throw new RuntimeException('No summary returned from Gemini.');
            }

            return $summary;
        });
    }
}
