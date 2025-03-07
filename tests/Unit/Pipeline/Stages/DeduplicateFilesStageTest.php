<?php

namespace Tests\Unit\Pipeline\Stages;

use App\Pipeline\Stages\DeduplicateFilesStage;
use Symfony\Component\Finder\SplFileInfo;
use Tests\TestCase;

class DeduplicateFilesStageTest extends TestCase
{
    protected string $tempDir;

    protected function setUp(): void
    {
        $this->tempDir = sys_get_temp_dir().'/deduplicate_files_stage_test_'.uniqid();
        mkdir($this->tempDir, 0777, true);
    }

    protected function tearDown(): void
    {
        $this->removeDirectory($this->tempDir);
    }

    protected function removeDirectory(string $dir): void
    {
        if (! is_dir($dir)) {
            return;
        }
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($iterator as $file) {
            if ($file->isDir()) {
                rmdir($file->getRealPath());
            } else {
                unlink($file->getRealPath());
            }
        }
        rmdir($dir);
    }

    /**
     * Helper to create a test file and return a SplFileInfo instance.
     */
    protected function createTestFile(string $relativePath, string $content): SplFileInfo
    {
        $fullPath = $this->tempDir.'/'.$relativePath;
        $dir = dirname($fullPath);
        if (! is_dir($dir)) {
            mkdir($dir, 0777, true);
        }
        file_put_contents($fullPath, $content);

        return new SplFileInfo($fullPath, dirname($relativePath), $relativePath);
    }

    public function test_deduplicate_files_stage_removes_duplicates()
    {
        // Create files with identical content in different locations
        $fileA = $this->createTestFile('a.txt', 'duplicate content');
        $fileB = $this->createTestFile('folder/b.txt', 'duplicate content'); // Same content as a.txt
        $fileC = $this->createTestFile('folder/subfolder/c.txt', 'duplicate content'); // Same content as a.txt and b.txt
        $fileD = $this->createTestFile('d.txt', 'unique content'); // Different content
        $fileE = $this->createTestFile('folder/e.txt', 'another unique content'); // Different content

        // Arrange them in an arbitrary order
        $files = [$fileC, $fileA, $fileB, $fileD, $fileE];

        $stage = new DeduplicateFilesStage;

        // Capture the output to avoid cluttering test output
        ob_start();

        $result = $stage->handle($files, function ($files) {
            return $files;
        });

        $output = ob_get_clean();

        // We should get 3 files back (not 5), as 3 had the same content
        $this->assertCount(3, $result);

        // Verify that exactly 2 duplicates were removed
        $this->assertStringContainsString('Removed 2 duplicate file(s)', $output);

        // Map the files to their contents and paths for easier assertion
        $resultContents = [];
        $resultPaths = [];

        foreach ($result as $file) {
            $resultContents[] = file_get_contents($file->getRealPath());
            $resultPaths[] = $file->getRelativePathname();
        }

        // Check that we have the expected content types
        $this->assertContains('duplicate content', $resultContents);
        $this->assertContains('unique content', $resultContents);
        $this->assertContains('another unique content', $resultContents);

        // The stage should keep the file with the shortest path
        $this->assertContains('a.txt', $resultPaths, 'The shortest path for duplicate content should be kept');
        $this->assertNotContains('folder/b.txt', $resultPaths, 'Longer path with duplicate content should be removed');
        $this->assertNotContains('folder/subfolder/c.txt', $resultPaths, 'Longest path with duplicate content should be removed');
    }

    public function test_deduplicate_files_stage_prefers_shorter_paths()
    {
        // Create files with identical content but in the reverse order of path length
        $fileA = $this->createTestFile('folder/subfolder/a.txt', 'same content');
        $fileB = $this->createTestFile('folder/b.txt', 'same content');
        $fileC = $this->createTestFile('c.txt', 'same content');

        // Add them in order of creation (longest path first)
        $files = [$fileA, $fileB, $fileC];

        $stage = new DeduplicateFilesStage;

        // Capture output
        ob_start();

        $result = $stage->handle($files, function ($files) {
            return $files;
        });

        ob_get_clean();

        // Should only have one file
        $this->assertCount(1, $result);

        // The file with the shortest path should be kept
        $this->assertEquals('c.txt', $result[0]->getRelativePathname());
    }
}
