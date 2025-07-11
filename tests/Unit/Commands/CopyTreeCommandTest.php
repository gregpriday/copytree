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
        $this->assertStringContainsString('to clipboard.', $output);
        // The output format is now "Copied X files [SIZE] to clipboard."
        $this->assertMatchesRegularExpression('/Copied \d+ files \[.*\] to clipboard\./', $output);
    }

    public function test_dry_run_flag_is_recognized_and_lists_files()
    {
        // Create additional files for better testing
        file_put_contents($this->tempDir.'/file1.php', '<?php echo "Hello";');
        file_put_contents($this->tempDir.'/file2.txt', 'Text content');

        // Run the command with dry-run and filter
        Artisan::call('copy', [
            'path' => $this->tempDir,
            '--dry-run' => true,
            '--filter' => '*.php',
        ]);
        
        $output = Artisan::output();
        
        // Assert the expected output structure
        $this->assertStringContainsString('Files that would be included:', $output);
        $this->assertStringContainsString('file1.php [', $output);  // File with size bracket
        $this->assertStringNotContainsString('file2.txt [', $output);  // Verify filter applied
        $this->assertStringNotContainsString('a.txt [', $output);  // Verify filter applied
        $this->assertStringContainsString('Total files: 1', $output);
        
        // Ensure no XML output is generated
        $this->assertStringNotContainsString('<ct:project>', $output);
        $this->assertStringNotContainsString('<ct:tree>', $output);
    }

    public function test_dry_run_with_no_matching_files()
    {
        // Run with filter that matches no files
        Artisan::call('copy', [
            'path' => $this->tempDir,
            '--dry-run' => true,
            '--filter' => '*.nonexistent',
        ]);
        
        $output = Artisan::output();
        
        $this->assertStringContainsString('No files would be included based on the current filters and profile.', $output);
    }

    public function test_dry_run_skips_ai_filter()
    {
        // Run with --ai-filter; expect warning and no AI call
        Artisan::call('copy', [
            'path' => $this->tempDir,
            '--dry-run' => true,
            '--ai-filter' => 'include PHP files',
        ]);
        
        $output = Artisan::output();
        
        $this->assertStringContainsString('AI filters are skipped in --dry-run mode.', $output);
        // Should still list files without AI filtering
        $this->assertStringContainsString('Files that would be included:', $output);
    }

    public function test_dry_run_with_multiple_filters()
    {
        // Create files to test multiple filters
        file_put_contents($this->tempDir.'/script.php', '<?php echo "script";');
        file_put_contents($this->tempDir.'/test.php', '<?php echo "test";');
        file_put_contents($this->tempDir.'/readme.md', '# README');
        
        // Run with multiple glob filters
        Artisan::call('copy', [
            'path' => $this->tempDir,
            '--dry-run' => true,
            '--filter' => ['*.php', '*.md'],
        ]);
        
        $output = Artisan::output();
        
        // All PHP and MD files should be listed (with size brackets)
        $this->assertStringContainsString('script.php [', $output);
        $this->assertStringContainsString('test.php [', $output);
        $this->assertStringContainsString('readme.md [', $output);
        $this->assertStringContainsString('Total files: 3', $output);
    }
}
