<?php

namespace App\Transforms\Transformers\Summarizers;

use App\Helpers\PrismHelper;
use App\Transforms\BaseTransformer;
use App\Transforms\FileTransformerInterface;
use App\Transforms\SlowTransformerTrait;
use App\Transforms\Transformers\Loaders\FileLoader;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Prism\Prism\ValueObjects\Messages\UserMessage;
use RuntimeException;
use Symfony\Component\Finder\SplFileInfo;
use Throwable;

class CodeSummary extends BaseTransformer implements FileTransformerInterface
{
    use SlowTransformerTrait;

    const MAX_CODE_LENGTH = 32000;

    /**
     * Transform the given source code file into a concise summary.
     *
     * @param  SplFileInfo|string  $input  The source code file to summarize.
     * @return string The generated code summary.
     *
     * @throws RuntimeException If the input is not a SplFileInfo instance or if the AI API call fails.
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
            $systemPrompt = File::get(base_path('prompts/code-summary/system.txt'));

            // Build the prompt using the wrapped code.
            $prompt = "Please provide a concise summary for the following source code:\n\n".$wrappedCode;

            try {
                $provider = Config::get('ai.default_provider', 'openai');
                $modelSize = Config::get('ai.defaults.model_size_for_summarization', 'medium');
                $model = Config::get("ai.providers.{$provider}.models.{$modelSize}");
                $temperature = Config::get('ai.task_parameters.summarization.temperature', 0.2);
                $maxTokens = Config::get('ai.task_parameters.summarization.max_tokens', 512);

                $response = PrismHelper::text($provider, $model)
                    ->withSystemPrompt($systemPrompt)
                    ->withMessages([new UserMessage($prompt)])
                    ->withMaxTokens($maxTokens)
                    ->usingTemperature($temperature)
                    ->asText();
            } catch (Throwable $e) {
                // Log the exception
                Log::error('Failed to summarize code: '.$e->getMessage(), [
                    'code_length' => strlen($content),
                    'language' => $language,
                ]);

                // Return a fallback summary
                return '[Summary generation failed: The AI model encountered an error while summarizing this code.]';
            }

            $summary = $response->text ?? '';

            // Remove code fences if present.
            $cleanOutput = preg_replace('/^```(?:[a-zA-Z]*\n)?(.*?)```$/s', '$1', trim($summary));

            $summary = trim($cleanOutput);
            if (empty($summary)) {
                throw new RuntimeException('No code summary returned from AI.');
            }

            return $summary;
        });
    }
}
