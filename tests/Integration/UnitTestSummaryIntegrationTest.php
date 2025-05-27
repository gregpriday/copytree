<?php

namespace Tests\Integration;

use App\Transforms\Transformers\Summarizers\UnitTestSummary;
use Symfony\Component\Finder\SplFileInfo;
use Tests\TestCase;

class UnitTestSummaryIntegrationTest extends TestCase
{
    public function test_unit_test_summary_integration_with_complex_test_file(): void
    {
        // Skip the test if the Fireworks API key is not set.
        if (empty(env('FIREWORKS_API_KEY'))) {
            $this->markTestSkipped('Fireworks API key not set. Skipping UnitTestSummary integration test.');
        }

        // Use a complex unit test file that tests intricate functionality:
        // Here we use the FileUtilsTest which covers many edge cases.
        $filePath = base_path('tests/Unit/Utilities/FileUtilsTest.php');
        $this->assertFileExists($filePath, 'The FileUtilsTest.php file must exist.');

        // Wrap the file in a SplFileInfo instance.
        $fileInfo = new SplFileInfo($filePath, 'tests/Unit/Utilities', 'FileUtilsTest.php');

        // Instantiate the UnitTestSummary transformer.
        $transformer = new UnitTestSummary;

        // Generate the summary by making an actual request to the Fireworks API.
        $summary = $transformer->transform($fileInfo);

        // Assert that a non-empty summary is returned.
        $this->assertIsString($summary, 'The summary should be a string.');
        $this->assertNotEmpty($summary, 'The unit test summary should not be empty.');

        // Output the summary for manual inspection.
        fwrite(STDOUT, "Complex Unit Test Summary:\n".$summary."\n");
    }
}
