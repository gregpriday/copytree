<?php

namespace Tests\Unit\Pipeline\Stages;

use App\Pipeline\Stages\ComposerStage;
use Symfony\Component\Finder\SplFileInfo;
use Tests\TestCase;

class ComposerStageTest extends TestCase
{
    protected string $tempDir;

    protected function setUp(): void
    {
        parent::setUp();

        // Create a unique temporary directory for tests
        $this->tempDir = sys_get_temp_dir().'/composer_stage_test_'.uniqid();
        mkdir($this->tempDir, 0777, true);

        // Set up basic vendor structure
        mkdir($this->tempDir.'/vendor/test-vendor/test-package/.ctree', 0777, true);
    }

    protected function tearDown(): void
    {
        $this->removeDirectory($this->tempDir);
        parent::tearDown();
    }

    /**
     * Test that the stage correctly finds instruction files in vendor packages.
     */
    public function test_handle_finds_vendor_instructions()
    {
        // Create a mock composer.json with a test package
        $composerJson = [
            'require' => [
                'test-vendor/test-package' => '^1.0',
            ],
        ];
        file_put_contents(
            $this->tempDir.'/composer.json',
            json_encode($composerJson, JSON_PRETTY_PRINT)
        );

        // Create the instruction file
        $instructionContent = "# Test Package Instructions\n\nThis is a test instruction file.";
        file_put_contents(
            $this->tempDir.'/vendor/test-vendor/test-package/.ctree/instructions.md',
            $instructionContent
        );

        // Create a mock file list with composer.json
        $mockComposerJson = new SplFileInfo(
            $this->tempDir.'/composer.json',
            '',
            'composer.json'
        );
        $mockOtherFile = new SplFileInfo(
            $this->tempDir.'/other-file.txt',
            '',
            'other-file.txt'
        );
        $files = [$mockComposerJson, $mockOtherFile];

        // Initialize the stage
        $stage = new ComposerStage($this->tempDir);

        // Define next stage as identity function
        $next = function ($files) {
            return $files;
        };

        // Process the files
        $result = $stage->handle($files, $next);

        // Assert that we now have 3 files (the original 2 plus the instruction file)
        $this->assertCount(3, $result, 'Expected 3 files after adding instruction file');

        // Get relative paths of all files in the result
        $paths = array_map(function (SplFileInfo $file) {
            return $file->getRelativePathname();
        }, $result);

        // Assert that the instruction file was added
        $this->assertContains(
            'vendor/test-vendor/test-package/.ctree/instructions.md',
            $paths,
            'Expected instruction file to be included'
        );
    }

    /**
     * Test that the stage correctly handles a project without composer.json.
     */
    public function test_handle_with_no_composer_json()
    {
        // Create a mock file list without composer.json
        $mockFile = new SplFileInfo(
            $this->tempDir.'/some-file.txt',
            '',
            'some-file.txt'
        );
        $files = [$mockFile];

        // Initialize the stage
        $stage = new ComposerStage($this->tempDir);

        // Define next stage as identity function
        $next = function ($files) {
            return $files;
        };

        // Process the files
        $result = $stage->handle($files, $next);

        // Assert that the file list is unchanged
        $this->assertCount(1, $result, 'Expected file list to remain unchanged');
        $this->assertSame($files, $result, 'Expected the same file list to be returned');
    }

    /**
     * Test that the stage correctly handles a project with composer.json but no packages.
     */
    public function test_handle_with_empty_composer_json()
    {
        // Create an empty composer.json
        file_put_contents(
            $this->tempDir.'/composer.json',
            '{}'
        );

        // Create a mock file list with composer.json
        $mockComposerJson = new SplFileInfo(
            $this->tempDir.'/composer.json',
            '',
            'composer.json'
        );
        $files = [$mockComposerJson];

        // Initialize the stage
        $stage = new ComposerStage($this->tempDir);

        // Define next stage as identity function
        $next = function ($files) {
            return $files;
        };

        // Process the files
        $result = $stage->handle($files, $next);

        // Assert that the file list is unchanged
        $this->assertCount(1, $result, 'Expected file list to remain unchanged');
        $this->assertSame($files, $result, 'Expected the same file list to be returned');
    }
}
