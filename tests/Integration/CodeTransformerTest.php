<?php

namespace Tests\Integration;

use App\Transforms\Transformers\Summarizers\CodeSummary;
use Symfony\Component\Finder\SplFileInfo;
use Tests\TestCase;

class CodeTransformerTest extends TestCase
{
    public function test_code_summary_integration()
    {
        // Skip the test if the GEMINI_API_KEY is not set.
        if (empty(env('GEMINI_API_KEY'))) {
            $this->markTestSkipped('Gemini API key not set. Skipping CodeTransformer integration test.');
        }

        // Use an actual file from the project. Here we use ClearCacheCommand.php.
        $filePath = base_path('app/Services/AIFilenameGenerator.php');
        $this->assertFileExists($filePath, 'The file app/Commands/ClearCacheCommand.php should exist.');

        // Wrap the actual file in a SplFileInfo instance.
        $fileInfo = new SplFileInfo($filePath, 'app/Commands', 'ClearCacheCommand.php');

        // Instantiate the CodeSummary transformer.
        $transformer = new CodeSummary;

        // Run the transformer. This will make an actual request to Gemini.
        $summary = $transformer->transform($fileInfo);

        // Assert that a non-empty summary is returned.
        $this->assertIsString($summary, 'The summary should be a string.');
        $this->assertNotEmpty($summary, 'The code summary should not be empty.');

        // Optionally, output the summary for inspection.
        fwrite(STDOUT, "Code Summary:\n".$summary."\n");
    }
}
