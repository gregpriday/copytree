<?php

namespace Tests\Feature;

use Tests\TestCase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\File;

class CopyTreeCommandValidateTest extends TestCase
{
    protected string $tempDir;

    protected function setUp(): void
    {
        parent::setUp();

        // Create a temporary project directory
        $this->tempDir = sys_get_temp_dir() . '/copytree_validate_test_' . uniqid();
        mkdir($this->tempDir, 0777, true);

        // Create some test files
        file_put_contents($this->tempDir . '/test.php', '<?php echo "test";');
        file_put_contents($this->tempDir . '/README.md', '# Test Project');
    }

    protected function tearDown(): void
    {
        $this->removeDirectory($this->tempDir);
        parent::tearDown();
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

    public function test_validate_flag_passes_for_good_profile()
    {
        // Create a valid profile
        $ctreeDir = $this->tempDir . '/.ctree';
        mkdir($ctreeDir, 0777, true);
        
        $validProfile = <<<YAML
include:
  - "*.php"
  - "*.md"
exclude:
  - "vendor/**"
  - "tests/**"
always:
  - "README.md"
YAML;
        
        file_put_contents($ctreeDir . '/valid.yaml', $validProfile);

        // Run validate command
        $exitCode = Artisan::call('copy', [
            'path' => $this->tempDir,
            '--validate' => true,
            '--profile' => 'valid',
        ]);

        $output = Artisan::output();

        $this->assertEquals(0, $exitCode);
        $this->assertStringContainsString('Valid', $output);
        $this->assertStringContainsString('valid.yaml', $output);
    }

    public function test_validate_flag_fails_for_bad_profile()
    {
        // Create an invalid profile with unknown key
        $ctreeDir = $this->tempDir . '/.ctree';
        mkdir($ctreeDir, 0777, true);
        
        $invalidProfile = <<<YAML
include:
  - "*.php"
foo: bar  # Unknown key
exclude:
  - "vendor/**"
YAML;
        
        file_put_contents($ctreeDir . '/invalid.yaml', $invalidProfile);

        // Run validate command
        $exitCode = Artisan::call('copy', [
            'path' => $this->tempDir,
            '--validate' => true,
            '--profile' => 'invalid',
        ]);

        $output = Artisan::output();

        $this->assertEquals(1, $exitCode);
        $this->assertStringContainsString('Invalid', $output);
        $this->assertStringContainsString("Unknown top-level key found: 'foo'", $output);
    }

    public function test_validate_flag_rejects_conflicts()
    {
        // Test with --dry-run conflict
        $exitCode = Artisan::call('copy', [
            'path' => $this->tempDir,
            '--validate' => true,
            '--dry-run' => true,
            '--profile' => 'default',
        ]);

        $output = Artisan::output();

        $this->assertEquals(2, $exitCode);
        $this->assertStringContainsString('--validate may not be used with --dry-run', $output);

        // Test with --output conflict
        $exitCode = Artisan::call('copy', [
            'path' => $this->tempDir,
            '--validate' => true,
            '--output' => 'test.txt',
            '--profile' => 'default',
        ]);

        $output = Artisan::output();

        $this->assertEquals(2, $exitCode);
        $this->assertStringContainsString('--validate may not be used with', $output);
        $this->assertStringContainsString('--output', $output);
    }

    public function test_validate_with_profile_not_found()
    {
        $exitCode = Artisan::call('copy', [
            'path' => $this->tempDir,
            '--validate' => true,
            '--profile' => 'nonexistent',
        ]);

        $output = Artisan::output();

        $this->assertEquals(1, $exitCode);
        $this->assertStringContainsString("Profile 'nonexistent' not found", $output);
    }

    public function test_validate_with_no_profile_flag()
    {
        $exitCode = Artisan::call('copy', [
            'path' => $this->tempDir,
            '--validate' => true,
            '--no-profile' => true,
        ]);

        $output = Artisan::output();

        $this->assertEquals(1, $exitCode);
        $this->assertStringContainsString('No profile specified or found', $output);
    }
}