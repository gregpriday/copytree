<?php

namespace Tests\Unit\Pipeline\Stages;

use App\Events\DuplicateFileFoundEvent;
use App\Pipeline\Stages\DeduplicateFilesStage;
use Illuminate\Support\Facades\Event;
use Symfony\Component\Finder\SplFileInfo;
use Tests\TestCase;

class DeduplicateFilesStageTest extends TestCase
{
    protected string $tempDir;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tempDir = sys_get_temp_dir().'/deduplicate_files_stage_test_'.uniqid();
        mkdir($this->tempDir, 0777, true);

        // Mock the event facade
        Event::fake();
    }

    protected function tearDown(): void
    {
        $this->removeDirectory($this->tempDir);
        parent::tearDown();
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

        $result = $stage->handle($files, function ($files) {
            return $files;
        });

        // We should get 3 files back (not 5), as 3 had the same content
        $this->assertCount(3, $result);

        // Verify that events were fired for the duplicates
        // Each duplicate fires one event for itself, plus one additional event if it replaces an existing file
        Event::assertDispatched(DuplicateFileFoundEvent::class, 3);

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

        $result = $stage->handle($files, function ($files) {
            return $files;
        });

        // Should only have one file
        $this->assertCount(1, $result);

        // The file with the shortest path should be kept
        $this->assertEquals('c.txt', $result[0]->getRelativePathname());

        // Verify events were dispatched
        // The first file is added to uniqueMap without an event
        // The second file triggers an event for itself
        // The third file triggers an event for itself and one for the file it replaces
        Event::assertDispatched(DuplicateFileFoundEvent::class, 4);
    }

    public function test_large_files_skip_content_deduplication()
    {
        // Create a large file mock
        $largePath = 'large.csv';
        $fullPath = $this->tempDir.'/'.$largePath;
        touch($fullPath);

        // Create a mock SplFileInfo object that pretends to be large (>1MB)
        $largeFile = $this->getMockBuilder(SplFileInfo::class)
            ->setConstructorArgs([$fullPath, '', $largePath])
            ->onlyMethods(['getSize', 'getRelativePathname'])
            ->getMock();

        $largeFile->method('getSize')->willReturn(1024 * 1024 + 1); // Just over 1MB
        $largeFile->method('getRelativePathname')->willReturn($largePath);

        // Create a duplicate content file with same path pattern
        $duplicatePath = 'duplicate_large.csv';
        $duplicateFullPath = $this->tempDir.'/'.$duplicatePath;
        touch($duplicateFullPath);

        $duplicateFile = $this->getMockBuilder(SplFileInfo::class)
            ->setConstructorArgs([$duplicateFullPath, '', $duplicatePath])
            ->onlyMethods(['getSize', 'getRelativePathname'])
            ->getMock();

        $duplicateFile->method('getSize')->willReturn(1024 * 1024 + 2); // Also over 1MB
        $duplicateFile->method('getRelativePathname')->willReturn($duplicatePath);

        $files = [$largeFile, $duplicateFile];

        $stage = new DeduplicateFilesStage;

        $result = $stage->handle($files, function ($files) {
            return $files;
        });

        // Both large files should be included, even if they had identical content
        $this->assertCount(2, $result);

        $resultPaths = array_map(function ($file) {
            return $file->getRelativePathname();
        }, $result);

        // Check both files are present
        $this->assertContains($largePath, $resultPaths);
        $this->assertContains($duplicatePath, $resultPaths);

        // No duplicate file events should be dispatched
        Event::assertNotDispatched(DuplicateFileFoundEvent::class);
    }

    public function test_binary_files_skip_content_deduplication()
    {
        // Create a binary file with null bytes
        $binaryContent = "Binary\0File\0With\0Null\0Bytes";
        $binaryPath = 'binary.dat';
        $binaryFile = $this->createTestFile($binaryPath, $binaryContent);

        // Create another binary file with the same content
        $duplicate = 'duplicate_binary.dat';
        $duplicateFile = $this->createTestFile($duplicate, $binaryContent);

        $files = [$binaryFile, $duplicateFile];

        $stage = new DeduplicateFilesStage;

        $result = $stage->handle($files, function ($files) {
            return $files;
        });

        // Both binary files should be included, even with identical content
        $this->assertCount(2, $result);

        $resultPaths = array_map(function ($file) {
            return $file->getRelativePathname();
        }, $result);

        // Check both files are present
        $this->assertContains($binaryPath, $resultPaths);
        $this->assertContains($duplicate, $resultPaths);

        // No duplicate file events should be dispatched
        Event::assertNotDispatched(DuplicateFileFoundEvent::class);
    }

    public function test_csv_files_for_transformer_are_handled_efficiently()
    {
        // Create CSV file paths that would match CSVFirstLinesTransformer
        $dropDataPath = 'tests/Fixtures/data/drop_data.csv';
        $priceDataPath = 'tests/Fixtures/data/price_data.csv';

        // Create directory structure
        mkdir($this->tempDir.'/tests/Fixtures/data', 0777, true);

        // Touch the files to create them
        touch($this->tempDir.'/'.$dropDataPath);
        touch($this->tempDir.'/'.$priceDataPath);

        // Create mock SplFileInfo objects for large CSV files
        $dropDataFile = $this->getMockBuilder(SplFileInfo::class)
            ->setConstructorArgs([$this->tempDir.'/'.$dropDataPath, 'tests/Fixtures', $dropDataPath])
            ->onlyMethods(['getSize', 'getRelativePathname', 'getRealPath'])
            ->getMock();

        $dropDataFile->method('getSize')->willReturn(100 * 1024 * 1024); // 100MB
        $dropDataFile->method('getRelativePathname')->willReturn($dropDataPath);
        $dropDataFile->method('getRealPath')->willReturn($this->tempDir.'/'.$dropDataPath);

        $priceDataFile = $this->getMockBuilder(SplFileInfo::class)
            ->setConstructorArgs([$this->tempDir.'/'.$priceDataPath, 'tests/Fixtures', $priceDataPath])
            ->onlyMethods(['getSize', 'getRelativePathname', 'getRealPath'])
            ->getMock();

        $priceDataFile->method('getSize')->willReturn(50 * 1024 * 1024); // 50MB
        $priceDataFile->method('getRelativePathname')->willReturn($priceDataPath);
        $priceDataFile->method('getRealPath')->willReturn($this->tempDir.'/'.$priceDataPath);

        // Set up a timer to measure performance
        $startTime = microtime(true);

        $stage = new DeduplicateFilesStage;
        $result = $stage->handle([$dropDataFile, $priceDataFile], function ($files) {
            return $files;
        });

        $endTime = microtime(true);
        $executionTime = $endTime - $startTime;

        // Both CSV files should be included without content-based deduplication
        $this->assertCount(2, $result);

        // Verify no events were fired (no deduplication attempts)
        Event::assertNotDispatched(DuplicateFileFoundEvent::class);

        // The execution should be very fast since we're skipping content reads
        // Even with 150MB of data, this should execute in well under a second
        $this->assertLessThan(1.0, $executionTime,
            "Processing large CSV files should be fast (took {$executionTime} seconds)");

        // Further verify the specific files are included
        $resultPaths = array_map(function ($file) {
            return $file->getRelativePathname();
        }, $result);

        $this->assertContains($dropDataPath, $resultPaths);
        $this->assertContains($priceDataPath, $resultPaths);
    }
}
