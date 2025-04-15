<?php

namespace Tests\Integration;

use App\Transforms\Transformers\Summarizers\FileSummary;
use Illuminate\Support\Facades\File;
use Symfony\Component\Finder\SplFileInfo;
use Tests\TestCase;

class FileSummaryRealTest extends TestCase
{
    public function test_transform_returns_summary_using_real_ai_api(): void
    {
        // Skip the test if no AI API key is set.
        if (empty(config('ai.providers.'.config('ai.default_provider').'.key'))) {
            $this->markTestSkipped('AI API key not set. Skipping integration test.');
        }

        // Create a temporary text file with sample content.
        $tempFile = tempnam(sys_get_temp_dir(), 'file_summary_real_test_');
        $sampleContent = 'This is a sample text file used for integration testing of the FileSummary transformer. It contains information that should be summarized concisely by the AI API.';
        file_put_contents($tempFile, $sampleContent);

        // Wrap the temporary file in a SplFileInfo instance.
        $fileInfo = new SplFileInfo($tempFile, '', basename($tempFile));

        // Ensure that the system prompt file exists.
        $systemPromptPath = base_path('prompts/file-summary/system.txt');
        if (! file_exists($systemPromptPath)) {
            File::put($systemPromptPath, 'You are a file summarization assistant. Provide a concise summary for the given file content.');
        }

        // Instantiate the FileSummary transformer.
        $transformer = new FileSummary;

        // Call transform() to get the summary.
        $summary = $transformer->transform($fileInfo);

        // Assert that the summary is a non-empty string.
        $this->assertIsString($summary);
        $this->assertNotEmpty($summary, 'The summary returned by AI should not be empty.');

        // Optionally output the summary to STDOUT for inspection.
        fwrite(STDOUT, 'Real AI API Summary: '.$summary."\n");

        // Cleanup the temporary file.
        unlink($tempFile);
    }
}
