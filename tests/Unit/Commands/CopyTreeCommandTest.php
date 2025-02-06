<?php

namespace Tests\Unit\Commands;

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

class CopyTreeCommandTest extends TestCase
{
    protected string $tempDir;

    protected string $storageDir;

    protected function setUp(): void
    {
        parent::setUp();

        // Create a temporary project directory.
        $this->tempDir = sys_get_temp_dir().'/copytree_test_'.uniqid();
        mkdir($this->tempDir, 0777, true);

        // Create a dummy file.
        file_put_contents($this->tempDir.'/a.txt', 'This is file A content.');

        // Create a .ctree folder with a minimal profile.
        $ctreeDir = $this->tempDir.'/.ctree';
        mkdir($ctreeDir, 0777, true);
        $profileContent = json_encode([
            'rules' => [],
            'globalExcludeRules' => [],
            'always' => [],
        ], JSON_PRETTY_PRINT);
        file_put_contents($ctreeDir.'/default.json', $profileContent);

        // Set up a temporary storage directory for file output.
        // We bind the storage path so that storage_path('app/files') returns our temporary directory.
        $customStoragePath = $this->tempDir.'/storage';
        app()->instance('path.storage', $customStoragePath);

        // Ensure the "app/files" directory exists within our custom storage path.
        $this->storageDir = $customStoragePath.'/app/files';
        File::makeDirectory($this->storageDir, 0777, true, true);
    }

    protected function tearDown(): void
    {
        $this->removeDirectory($this->tempDir);
        parent::tearDown();
    }

    /**
     * Recursively remove a directory.
     */
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

    public function test_copy_tree_command_displays_tree_output()
    {
        // Run the command with --display and --only-tree options.
        Artisan::call('copy', [
            'path' => $this->tempDir,
            '--display' => true,
            '--only-tree' => true,
        ]);

        $output = Artisan::output();

        $this->assertStringContainsString('<ct:tree>', $output);
        $this->assertStringContainsString('a.txt', $output);
    }

    public function test_copy_tree_command_includes_project_files_section()
    {
        // Run the command with --display (without --only-tree) so that the project_files section is rendered.
        Artisan::call('copy', [
            'path' => $this->tempDir,
            '--display' => true,
        ]);
        $output = Artisan::output();

        $this->assertStringContainsString('<ct:tree>', $output);
        $this->assertStringContainsString('<ct:project_files>', $output);
        $this->assertStringContainsString('This is file A content.', $output);
    }

    public function test_copy_tree_command_writes_output_to_file()
    {
        // Specify an output filename.
        $outputFilename = 'test-output.txt';

        // Run the command with the --output option.
        Artisan::call('copy', [
            'path' => $this->tempDir,
            '--output' => $outputFilename,
        ]);
        $output = Artisan::output();

        // Assert that the output message indicates that the output was saved.
        $this->assertStringContainsString('Saved output to file:', $output);

        // Verify that the file exists in the default output directory (~/.copytree/outputs).
        $fullPath = copytree_path('outputs').DIRECTORY_SEPARATOR.$outputFilename;
        $this->assertTrue(File::exists($fullPath), "Output file [$fullPath] does not exist.");
    }

    public function test_copy_tree_command_copies_to_clipboard_by_default()
    {
        // Run the command without display, output, or as-reference options.
        Artisan::call('copy', [
            'path' => $this->tempDir,
        ]);
        $output = Artisan::output();

        // Assert that the output message indicates that files were copied to the clipboard.
        $this->assertStringContainsString('Copied', $output);
        $this->assertStringContainsString('files to clipboard.', $output);
    }
}
