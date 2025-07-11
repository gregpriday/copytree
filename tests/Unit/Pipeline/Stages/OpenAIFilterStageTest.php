<?php

namespace Tests\Unit\Pipeline\Stages;

use App\Pipeline\Stages\AIFilterStage;
use Prism\Prism\Prism;
use Prism\Prism\Testing\TextResponseFake;
use Symfony\Component\Finder\SplFileInfo;
use Tests\TestCase;

class OpenAIFilterStageTest extends TestCase
{
    public function test_handle_filters_files_based_on_open_ai_fake_response()
    {
        // Create a temporary directory for test files.
        $tempDir = sys_get_temp_dir().'/openai_filter_test_'.uniqid();
        mkdir($tempDir);

        // Create three test files with known contents.
        file_put_contents($tempDir.'/a.txt', 'Content of file A');
        file_put_contents($tempDir.'/b.txt', 'Content of file B');
        file_put_contents($tempDir.'/c.txt', 'Content of file C');

        // Create SplFileInfo objects for each file.
        // The third parameter is the relative path (i.e. the basename in this test).
        $fileA = new SplFileInfo($tempDir.'/a.txt', '', 'a.txt');
        $fileB = new SplFileInfo($tempDir.'/b.txt', '', 'b.txt');
        $fileC = new SplFileInfo($tempDir.'/c.txt', '', 'c.txt');
        $files = [$fileA, $fileB, $fileC];

        // Fake the Prism response.
        // The fake response returns JSON that indicates only "a.txt" and "c.txt" should be accepted.
        Prism::fake([
            TextResponseFake::make()->withText(json_encode(['files' => ['a.txt', 'c.txt']])),
        ]);

        // Instantiate the OpenAIFilterStage with a description.
        $description = 'Filter out non-relevant files';
        $stage = new AIFilterStage($description, 450);

        // The "next" closure is defined as the identity function.
        $next = function ($files) {
            return $files;
        };

        // Execute the stage.
        $filteredFiles = $stage->handle($files, $next);

        // Assert that only "a.txt" and "c.txt" remain.
        $this->assertCount(2, $filteredFiles);
        $filteredPaths = array_map(function (SplFileInfo $file) {
            return $file->getRelativePathname();
        }, $filteredFiles);
        $this->assertContains('a.txt', $filteredPaths);
        $this->assertContains('c.txt', $filteredPaths);
        $this->assertNotContains('b.txt', $filteredPaths);

        // Cleanup: remove temporary files and directory.
        foreach (glob($tempDir.'/*') as $file) {
            unlink($file);
        }
        rmdir($tempDir);
    }
}
