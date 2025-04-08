<?php

namespace App\Transforms\Transformers\Summarizers;

use App\Transforms\BaseTransformer;
use App\Transforms\FileTransformerInterface;
use App\Transforms\SlowTransformerTrait;
use App\Transforms\Transformers\Loaders\FileLoader;
use App\Facades\AI;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Symfony\Component\Finder\SplFileInfo;
use Throwable;

/**
 * Class UnitTestSummary
 *
 * This transformer analyzes a unit test file and uses the AI API to generate
 * a plain-text summary of important insights gained from the tests.
 * It works similarly to the CodeSummary transformer: it reads the file content,
 * determines its MIME type to extract a language identifier, wraps the content
 * in markdown code fences with that language, and then sends the wrapped content
 * along with the file's relative path and filename to AI for summarization.
 * The final output is plain text.
 *
 * Since this transformer is specific to unit test files, it is named UnitTestSummary.
 */
class UnitTestSummary extends BaseTransformer implements FileTransformerInterface
{
    use SlowTransformerTrait;

    /**
     * Maximum number of characters to process from the test file.
     */
    const MAX_TEST_LENGTH = 32000;

    /**
     * Transform the test file into a plain-text summary of key insights.
     *
     * The method wraps the file content in markdown code fences using the language
     * determined from the MIME type, then includes the file's relative path and filename
     * in the prompt sent to the AI API for summarization.
     *
     * @param  SplFileInfo|string  $input  The unit test file to summarize.
     * @return string The plain text summary.
     *
     * @throws RuntimeException If the input is invalid or the API call fails.
     */
    public function transform(SplFileInfo|string $input): string
    {
        if (! ($input instanceof SplFileInfo)) {
            throw new RuntimeException('UnitTestSummary transformer expects a SplFileInfo instance.');
        }

        $mimeType = File::mimeType($input->getRealPath());
        if (! str_starts_with($mimeType, 'text/')) {
            return (new FileLoader)->transform($input);
        }

        return $this->cacheTransformResult($input, function () use ($input, $mimeType) {
            $content = File::get($input->getRealPath());
            if (strlen($content) > self::MAX_TEST_LENGTH) {
                $content = substr($content, 0, self::MAX_TEST_LENGTH);
            }

            // Determine language identifier from the MIME type (as in CodeSummary)
            $language = '';
            if (str_contains($mimeType, '/')) {
                $parts = explode('/', $mimeType);
                $subtype = $parts[1] ?? '';
                // Remove any leading "x-" from the subtype.
                if (stripos($subtype, 'x-') === 0) {
                    $language = substr($subtype, 2);
                } else {
                    $language = $subtype;
                }
            }
            // Wrap the file content in markdown code fences with the determined language.
            $wrappedContent = "```{$language}\n{$content}\n```";

            // Retrieve the file's relative path and filename.
            $relativePath = $input->getRelativePathname();

            // Load a system prompt for test summarization.
            $systemPrompt = File::get(base_path('prompts/test-summary/system.txt'));

            // Include the relative path and filename in the prompt.
            $prompt = "File: `{$relativePath}`\n\nPlease provide a detailed summary of the key insights from the following test file:\n\n".$wrappedContent;

            try {
                $response = AI::chat()->create([
                    'model' => AI::models()['medium'],
                    'messages' => [
                        ['role' => 'system', 'content' => $systemPrompt],
                        ['role' => 'user', 'content' => $prompt],
                    ],
                    'max_tokens' => 512,
                    'temperature' => 0.2,
                ]);
            } catch (Throwable $e) {
                Log::error('Failed to generate unit test summary: '.$e->getMessage());
                throw new RuntimeException('AI API call failed: '.$e->getMessage());
            }

            $summary = $response->choices[0]->message->content ?? '';
            $summary = trim($summary);
            if (empty($summary)) {
                throw new RuntimeException('No test summary returned from AI.');
            }

            return $summary;
        });
    }
}
