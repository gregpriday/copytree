<?php

namespace App\Transforms\Transformers;

use App\Transforms\BaseTransformer;
use App\Transforms\FileTransformerInterface;
use Illuminate\Support\Facades\File;
use OpenAI\Laravel\Facades\OpenAI;
use RuntimeException;
use Symfony\Component\Finder\SplFileInfo;

class FileSummary extends BaseTransformer implements FileTransformerInterface
{
    /**
     * Transform the given file into a concise summary using OpenAI.
     *
     * If the file is not a text file (determined by its MIME type), this transformer
     * falls back to the default file loader.
     *
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
            return (new DefaultFileLoader)->transform($input);
        }

        // Read the file content.
        $content = File::get($input->getRealPath());

        // Optionally limit the content length to avoid huge requests.
        $maxLength = 2000; // adjust as needed
        if (strlen($content) > $maxLength) {
            $content = substr($content, 0, $maxLength);
        }

        // Load the system prompt for file summarization.
        $systemPromptPath = base_path('prompts/file-summary/system.txt');
        if (! File::exists($systemPromptPath)) {
            throw new RuntimeException('System prompt for file summary not found.');
        }
        $systemPrompt = File::get($systemPromptPath);

        // Prepare the messages for the OpenAI chat API.
        $messages = [
            ['role' => 'system', 'content' => $systemPrompt],
            ['role' => 'user', 'content' => "Please provide a concise summary for the following file content:\n\n".$content],
        ];

        try {
            $response = OpenAI::chat()->create([
                'model' => config('openai.model', 'gpt-4o'),
                'messages' => $messages,
                'temperature' => 0.3,
                'max_tokens' => 300,
            ]);
        } catch (\Exception $e) {
            throw new RuntimeException('OpenAI API call failed: '.$e->getMessage());
        }

        $summary = $response->choices[0]->message->content ?? '';
        if (empty($summary)) {
            throw new RuntimeException('No summary returned from OpenAI.');
        }

        return $summary;
    }
}
