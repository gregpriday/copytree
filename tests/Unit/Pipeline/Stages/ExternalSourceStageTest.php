<?php

namespace Tests\Unit\Pipeline\Stages;

use App\Pipeline\Stages\ExternalSourceStage;
use Symfony\Component\Finder\SplFileInfo;
use Tests\TestCase;

class ExternalSourceStageTest extends TestCase
{
    protected string $tempDir;

    protected string $externalDir;

    protected function setUp(): void
    {
        // Create a unique temporary directory for the tests.
        $this->tempDir = sys_get_temp_dir().'/external_source_test_'.uniqid();
        mkdir($this->tempDir, 0777, true);
        // Create a subdirectory to simulate the external source.
        $this->externalDir = $this->tempDir.'/external';
        mkdir($this->externalDir, 0777, true);
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

        // The third parameter is the relative pathname.
        return new SplFileInfo($fullPath, dirname($relativePath), $relativePath);
    }

    public function test_external_source_stage_merges_local_and_external_files()
    {
        // Create a local file.
        $localFile = $this->createTestFile('local.txt', 'local content');

        // Create an external file in the external directory.
        $externalFilePath = $this->externalDir.'/external.txt';
        file_put_contents($externalFilePath, 'external content');

        // Configure the external item to use the local external directory.
        $externalItems = [
            [
                'source' => $this->externalDir,
                'destination' => 'ext/',
            ],
        ];
        $stage = new ExternalSourceStage($externalItems);

        // Provide the local files as raw SplFileInfo objects.
        $localFiles = [$localFile];

        // The "next" closure just returns its input.
        $next = function ($files) {
            return $files;
        };

        $result = $stage->handle($localFiles, $next);

        // Expect one local file and one external file (each normalized as an array with 'file' and 'path').
        $this->assertCount(2, $result);

        $paths = array_map(fn ($item) => $item['path'], $result);
        $this->assertContains('local.txt', $paths);
        $this->assertContains('ext/external.txt', $paths);
    }

    public function test_external_source_stage_skips_invalid_source()
    {
        // Create a local file.
        $localFile = $this->createTestFile('local.txt', 'local content');

        // Configure an external item with an invalid (nonexistent) source directory.
        $externalItems = [
            [
                'source' => $this->tempDir.'/nonexistent',
                'destination' => 'ext/',
            ],
        ];
        $stage = new ExternalSourceStage($externalItems);

        $localFiles = [$localFile];
        $next = function ($files) {
            return $files;
        };

        // Since the external directory does not exist, only the local file should be returned.
        $result = $stage->handle($localFiles, $next);
        $this->assertCount(1, $result);
        $this->assertEquals('local.txt', $result[0]['path']);
    }
}
