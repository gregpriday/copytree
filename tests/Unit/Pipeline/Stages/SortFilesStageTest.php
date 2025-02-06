<?php

namespace Tests\Unit\Pipeline\Stages;

use App\Pipeline\Stages\SortFilesStage;
use Symfony\Component\Finder\SplFileInfo;
use Tests\TestCase;

class SortFilesStageTest extends TestCase
{
    protected string $tempDir;

    protected function setUp(): void
    {
        $this->tempDir = sys_get_temp_dir().'/sort_files_stage_test_'.uniqid();
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

    public function test_sort_files_stage_sorts_files()
    {
        // Create files with various nested paths.
        $fileA = $this->createTestFile('a.txt', 'file A');
        $fileB = $this->createTestFile('folder/b.txt', 'file B');
        $fileC = $this->createTestFile('folder/subfolder/c.txt', 'file C');
        $fileD = $this->createTestFile('b.txt', 'file D');

        // Arrange them in an unsorted order.
        $files = [$fileC, $fileA, $fileB, $fileD];

        $stage = new SortFilesStage;
        $next = function ($files) {
            return $files;
        };

        $result = $stage->handle($files, $next);

        // Get the relative paths.
        $paths = array_map(fn ($file) => $file->getRelativePathname(), $result);
        // Expected order (nested alphabetical order): a.txt, b.txt, folder/b.txt, folder/subfolder/c.txt
        $this->assertEquals(
            ['a.txt', 'b.txt', 'folder/b.txt', 'folder/subfolder/c.txt'],
            $paths
        );
    }
}
