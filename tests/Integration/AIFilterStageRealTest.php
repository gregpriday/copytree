<?php

namespace Tests\Integration;

use App\Pipeline\Stages\AIFilterStage;
use Symfony\Component\Finder\SplFileInfo;
use Tests\TestCase;

class AIFilterStageRealTest extends TestCase
{
    public function test_integration_real_open_ai_filter_stage()
    {
        // Skip the test if no OpenAI API key is set.
        if (empty(env('GEMINI_API_KEY'))) {
            $this->markTestSkipped('OPENAI_API_KEY is not set. Skipping OpenAI integration test.');
        }

        // Create a temporary directory.
        $tempDir = sys_get_temp_dir().'/openai_integration_test_'.uniqid();
        mkdir($tempDir);

        // Create two test files.
        // "integration.txt" contains a distinctive keyword.
        file_put_contents($tempDir.'/integration.txt', 'This file contains the keyword IntegrationTest. It is important for integration testing.');
        // "other.txt" does not contain the keyword.
        file_put_contents($tempDir.'/other.txt', 'This file does not have the special keyword.');

        // Wrap the files in SplFileInfo objects.
        $fileIntegration = new SplFileInfo($tempDir.'/integration.txt', '', 'integration.txt');
        $fileOther = new SplFileInfo($tempDir.'/other.txt', '', 'other.txt');
        $files = [$fileIntegration, $fileOther];

        // The description instructs OpenAI to select only files that contain the word "IntegrationTest".
        $description = "Select only files that contain the keyword 'IntegrationTest' in their content.";

        // Create an instance of OpenAIFilterStage.
        $stage = new AIFilterStage($description, 450);

        // The next stage is an identity function.
        $next = function ($files) {
            return $files;
        };

        // Call the stage; this will make a real request to OpenAI.
        $filteredFiles = $stage->handle($files, $next);

        // For demonstration purposes, output the relative paths of the filtered files.
        $filteredPaths = array_map(function (SplFileInfo $file) {
            return $file->getRelativePathname();
        }, $filteredFiles);
        fwrite(STDOUT, 'Filtered Files: '.implode(', ', $filteredPaths)."\n");

        // Assert that at least one file is returned.
        $this->assertNotEmpty($filteredFiles, 'Expected at least one file to be returned by the OpenAI filter.');

        // Assert that "integration.txt" is accepted.
        $this->assertContains('integration.txt', $filteredPaths, "Expected 'integration.txt' to be accepted by the filter.");

        // Optionally, assert that "other.txt" is not accepted.
        $this->assertNotContains('other.txt', $filteredPaths, "Expected 'other.txt' to be filtered out.");

        // Cleanup temporary files.
        foreach (glob($tempDir.'/*') as $file) {
            unlink($file);
        }
        rmdir($tempDir);
    }
}
