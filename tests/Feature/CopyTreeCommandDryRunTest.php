<?php

namespace Tests\Feature;

use Tests\TestCase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\File;

class CopyTreeCommandDryRunTest extends TestCase
{
    protected string $tempDir;

    protected function setUp(): void
    {
        parent::setUp();

        // Create a temporary project directory
        $this->tempDir = sys_get_temp_dir() . '/copytree_dryrun_test_' . uniqid();
        mkdir($this->tempDir, 0777, true);

        // Create a project structure with various file types
        $this->createTestProjectStructure();
    }

    protected function tearDown(): void
    {
        $this->removeDirectory($this->tempDir);
        parent::tearDown();
    }

    protected function createTestProjectStructure(): void
    {
        // Create directories
        mkdir($this->tempDir . '/src', 0777, true);
        mkdir($this->tempDir . '/tests', 0777, true);
        mkdir($this->tempDir . '/docs', 0777, true);
        mkdir($this->tempDir . '/config', 0777, true);

        // Create various files
        file_put_contents($this->tempDir . '/README.md', '# Test Project');
        file_put_contents($this->tempDir . '/composer.json', '{"name": "test/project"}');
        file_put_contents($this->tempDir . '/src/Controller.php', '<?php class Controller {}');
        file_put_contents($this->tempDir . '/src/Model.php', '<?php class Model {}');
        file_put_contents($this->tempDir . '/tests/ControllerTest.php', '<?php class ControllerTest {}');
        file_put_contents($this->tempDir . '/docs/api.md', '# API Documentation');
        file_put_contents($this->tempDir . '/config/app.php', '<?php return [];');
        file_put_contents($this->tempDir . '/.gitignore', 'vendor/');
    }

    protected function removeDirectory(string $dir): void
    {
        if (!is_dir($dir)) {
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

    public function test_dry_run_with_profile_and_filters()
    {
        // Create a Laravel-like profile in .ctree directory
        $ctreeDir = $this->tempDir . '/.ctree';
        mkdir($ctreeDir, 0777, true);
        
        $profileContent = "include:\n  - '*.php'\n  - '*.md'\nexclude:\n  - 'tests/**'\n  - 'vendor/**'\nalways:\n  - 'README.md'\n";
        file_put_contents($ctreeDir . '/laravel.yaml', $profileContent);

        // Run with profile and dry-run
        Artisan::call('copy', [
            'path' => $this->tempDir,
            '--dry-run' => true,
            '--profile' => 'laravel',
        ]);

        $output = Artisan::output();

        // Check that files are listed correctly based on profile
        $this->assertStringContainsString('Files that would be included:', $output);
        $this->assertStringContainsString('src/Controller.php', $output);
        $this->assertStringContainsString('src/Model.php', $output);
        $this->assertStringContainsString('config/app.php', $output);
        $this->assertStringContainsString('README.md', $output);
        
        // Tests directory should be excluded
        $this->assertStringNotContainsString('tests/ControllerTest.php', $output);
    }

    public function test_dry_run_with_git_modified_filter()
    {
        // Initialize git repo
        exec("cd {$this->tempDir} && git init");
        exec("cd {$this->tempDir} && git add .");
        exec("cd {$this->tempDir} && git commit -m 'Initial commit'");
        
        // Modify a file
        file_put_contents($this->tempDir . '/src/Controller.php', '<?php class Controller { /* modified */ }');
        
        // Add a new file
        file_put_contents($this->tempDir . '/src/NewFile.php', '<?php class NewFile {}');

        // Run with --modified flag
        Artisan::call('copy', [
            'path' => $this->tempDir,
            '--dry-run' => true,
            '--modified' => true,
        ]);

        $output = Artisan::output();

        // Only modified/new files should be listed
        $this->assertStringContainsString('src/Controller.php', $output);
        $this->assertStringContainsString('src/NewFile.php', $output);
        $this->assertStringContainsString('Total files: 2', $output);
        
        // Unmodified files should not be listed
        $this->assertStringNotContainsString('src/Model.php', $output);
        $this->assertStringNotContainsString('README.md', $output);
    }

    public function test_dry_run_with_depth_limit()
    {
        // Create deeply nested structure
        mkdir($this->tempDir . '/deep/nested/structure', 0777, true);
        file_put_contents($this->tempDir . '/deep/file1.php', '<?php');
        file_put_contents($this->tempDir . '/deep/nested/file2.php', '<?php');
        file_put_contents($this->tempDir . '/deep/nested/structure/file3.php', '<?php');

        // Run with depth limit
        Artisan::call('copy', [
            'path' => $this->tempDir,
            '--dry-run' => true,
            '--depth' => 2,
            '--filter' => '*.php',
        ]);

        $output = Artisan::output();

        // Files at depth 1 and 2 should be included
        $this->assertStringContainsString('deep/file1.php', $output);
        $this->assertStringContainsString('deep/nested/file2.php', $output);
        
        // Files at depth 3 should not be included
        $this->assertStringNotContainsString('deep/nested/structure/file3.php', $output);
    }

    public function test_dry_run_with_order_by_modified()
    {
        // Create files with different modification times
        file_put_contents($this->tempDir . '/old_file.php', '<?php');
        sleep(1); // Ensure different timestamps
        file_put_contents($this->tempDir . '/new_file.php', '<?php');

        // Run with order-by modified
        Artisan::call('copy', [
            'path' => $this->tempDir,
            '--dry-run' => true,
            '--order-by' => 'modified',
            '--filter' => '*.php',
        ]);

        $output = Artisan::output();

        // Files should be listed
        $this->assertStringContainsString('old_file.php', $output);
        $this->assertStringContainsString('new_file.php', $output);
        
        // Verify the ordering by checking position in output
        $oldPos = strpos($output, 'old_file.php');
        $newPos = strpos($output, 'new_file.php');
        $this->assertLessThan($oldPos, $newPos, 'new_file.php should appear before old_file.php when ordered by modified');
    }

    public function test_dry_run_does_not_create_output_files()
    {
        // Run with output option but dry-run should prevent file creation
        Artisan::call('copy', [
            'path' => $this->tempDir,
            '--dry-run' => true,
            '--output' => 'test-output.txt',
        ]);

        $output = Artisan::output();

        // Should not contain messages about saving to file
        $this->assertStringNotContainsString('Saved output to file:', $output);
        
        // Output file should not exist
        $outputPath = copytree_path('outputs') . '/test-output.txt';
        $this->assertFalse(File::exists($outputPath));
        
        // Should show dry-run output instead
        $this->assertStringContainsString('Files that would be included:', $output);
    }

    public function test_dry_run_with_size_report_option()
    {
        // Create files with different sizes
        file_put_contents($this->tempDir . '/small.txt', 'small');
        file_put_contents($this->tempDir . '/large.txt', str_repeat('large', 1000));

        // Run with size-report and dry-run
        Artisan::call('copy', [
            'path' => $this->tempDir,
            '--dry-run' => true,
            '--size-report' => true,
        ]);

        $output = Artisan::output();

        // Should show dry-run output, not size report
        $this->assertStringContainsString('Files that would be included:', $output);
        $this->assertStringContainsString('small.txt', $output);
        $this->assertStringContainsString('large.txt', $output);
        
        // Should not contain size report elements
        $this->assertStringNotContainsString('Size Report', $output);
    }
}