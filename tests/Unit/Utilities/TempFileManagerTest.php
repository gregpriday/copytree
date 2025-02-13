<?php

namespace Tests\Unit\Utilities;

use App\Utilities\TempFileManager;
use DirectoryIterator;
use PHPUnit\Framework\TestCase;

class TempFileManagerTest extends TestCase
{
    /**
     * @var string
     */
    private $tempDir;

    protected function setUp(): void
    {
        parent::setUp();
        // Get the temp directory used by TempFileManager
        $this->tempDir = TempFileManager::getTempDir();
    }

    protected function tearDown(): void
    {
        // Clean up: remove any files created in the temp directory that start with our prefix.
        foreach (new DirectoryIterator($this->tempDir) as $fileInfo) {
            if (
                $fileInfo->isFile() &&
                str_starts_with($fileInfo->getFilename(), 'ctree_output_')
            ) {
                unlink($fileInfo->getPathname());
            }
        }
        parent::tearDown();
    }

    public function test_get_temp_dir_creates_directory(): void
    {
        // Remove the directory if it already exists to simulate a fresh state.
        if (is_dir($this->tempDir)) {
            $this->removeDirectory($this->tempDir);
        }

        $dir = TempFileManager::getTempDir();
        $this->assertDirectoryExists($dir, 'Temp directory should be created by getTempDir().');
    }

    public function test_create_temp_file_creates_file_with_correct_content(): void
    {
        $content = 'Test content for temporary file';
        $filePath = TempFileManager::createTempFile($content);

        $this->assertFileExists($filePath, 'Temporary file should be created.');
        // Assert that the filename starts with our defined prefix.
        $this->assertStringStartsWith('ctree_output_', basename($filePath), 'Filename should start with "ctree_output_".');
        // Assert that the file content matches what was passed in.
        $actualContent = file_get_contents($filePath);
        $this->assertEquals($content, $actualContent, 'The content of the temporary file should match the input.');
    }

    public function test_clean_old_files_removes_files_older_than_max_age(): void
    {
        // Create a temporary file.
        $content = 'Old file content';
        $filePath = TempFileManager::createTempFile($content);
        $this->assertFileExists($filePath, 'Temporary file should be created.');

        // Set its modification time to be older than MAX_AGE (15 minutes + 10 seconds).
        $oldTime = time() - (15 * 60 + 10);
        touch($filePath, $oldTime);

        // Call cleanOldFiles; this should delete the file.
        TempFileManager::cleanOldFiles();
        $this->assertFileDoesNotExist($filePath, 'Old temporary file should be removed by cleanOldFiles().');

        // Create another file and set its modification time to now.
        $newContent = 'New file content';
        $newFilePath = TempFileManager::createTempFile($newContent);
        touch($newFilePath, time());
        TempFileManager::cleanOldFiles();
        $this->assertFileExists($newFilePath, 'New temporary file should not be removed by cleanOldFiles().');

        // Clean up the new file.
        unlink($newFilePath);
    }

    /**
     * Recursively remove a directory.
     */
    private function removeDirectory(string $dir): void
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
}
