<?php

namespace App\Transforms\Transformers\Summarizers;

use App\Transforms\BaseTransformer;
use App\Transforms\FileTransformerInterface;
use App\Transforms\Transformers\Loaders\FileLoader;
use Gemini\Data\Content;
use Gemini\Laravel\Facades\Gemini;
use Illuminate\Support\Facades\File;
use RuntimeException;
use Symfony\Component\Finder\SplFileInfo;

class CodeSummary extends BaseTransformer implements FileTransformerInterface
{
    const MAX_CODE_LENGTH = 32000;

    /**
     * Transform the given source code file into a concise summary.
     *
     * @param  SplFileInfo|string  $input  The source code file to summarize.
     * @return string The generated code summary.
     *
     * @throws RuntimeException If the input is not a SplFileInfo instance or if the Gemini API call fails.
     */
    public function transform(SplFileInfo|string $input): string
    {
        if (! ($input instanceof SplFileInfo)) {
            throw new RuntimeException('CodeSummary transformer expects a SplFileInfo instance.');
        }

        // Only process text files; otherwise, fall back to the default file loader.
        $mimeType = File::mimeType($input->getRealPath());
        if (! str_starts_with($mimeType, 'text/')) {
            return (new FileLoader)->transform($input);
        }

        // Use caching to avoid redundant API calls.
        return $this->cacheTransformResult($input, function () use ($input, $mimeType) {
            // Read the file content.
            $content = File::get($input->getRealPath());

            // Optionally limit the content length.
            if (strlen($content) > self::MAX_CODE_LENGTH) {
                $content = substr($content, 0, self::MAX_CODE_LENGTH);
            }

            // Determine the language from the MIME type.
            $language = '';
            if (str_contains($mimeType, '/')) {
                $parts = explode('/', $mimeType);
                $subtype = $parts[1] ?? '';
                // Remove a leading "x-" if present.
                if (stripos($subtype, 'x-') === 0) {
                    $language = substr($subtype, 2);
                } else {
                    $language = $subtype;
                }
            }

            // Wrap the code in Markdown code fences with the language.
            $wrappedCode = '```'.$language."\n".$content."\n```";

            // Load the system prompt from a file if available; otherwise, use a placeholder.
            $systemPromptPath = base_path('prompts/code-summary/system.txt');
            if (File::exists($systemPromptPath)) {
                $systemPrompt = File::get($systemPromptPath);
            } else {
                $systemPrompt = 'Please summarize the following source code. Return only the code summary wrapped in code fences with no additional text.';
            }

            // Build the prompt using the wrapped code.
            $prompt = "Please provide a concise summary for the following source code:\n\n".$wrappedCode;

            try {
                $response = Gemini::generativeModel(
                    model: config('gemini.model'))
                    ->withSystemInstruction(Content::parse($systemPrompt)
                    )->generateContent($prompt);
            } catch (\Exception $e) {
                throw new RuntimeException('Gemini API call failed: '.$e->getMessage());
            }

            $rawOutput = $response->text() ?? '';

            // Remove code fences if present.
            $cleanOutput = preg_replace('/^```(?:[a-zA-Z]*\n)?(.*?)```$/s', '$1', trim($rawOutput));

            $summary = trim($cleanOutput);
            if (empty($summary)) {
                throw new RuntimeException('No code summary returned from Gemini.');
            }

            return $summary;
        });
    }
}
