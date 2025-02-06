<?php

namespace Tests\Unit\Pipeline;

use App\Pipeline\FileLoader;
use Illuminate\Support\Facades\Config;
use InvalidArgumentException;
use Symfony\Component\Finder\SplFileInfo;
use Tests\TestCase;

class FileLoaderTest extends TestCase
{
    /**
     * A temporary directory for testing.
     */
    protected string $tempDir;

    protected function setUp(): void
    {
        parent::setUp();
        // Create a unique temporary directory for our tests.
        $this->tempDir = sys_get_temp_dir().'/fileloader_test_'.uniqid();
        mkdir($this->tempDir, 0777, true);
    }

    protected function tearDown(): void
    {
        $this->removeDirectory($this->tempDir);
        parent::tearDown();
    }

    /**
     * Recursively remove a directory and all its contents.
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

    public function test_constructor_throws_exception_for_invalid_directory(): void
    {
        $this->expectException(InvalidArgumentException::class);
        // Pass a non-existing directory.
        new FileLoader($this->tempDir.'/nonexistent');
    }

    public function test_load_files_returns_all_files_when_no_exclusions(): void
    {
        // Create some test files.
        file_put_contents($this->tempDir.'/file1.txt', 'Content 1');
        mkdir($this->tempDir.'/subdir', 0777, true);
        file_put_contents($this->tempDir.'/subdir/file2.txt', 'Content 2');

        // Set configuration values to empty arrays.
        Config::set('copytree.global_excluded_directories', []);
        Config::set('copytree.base_path_excluded_directories', []);
        Config::set('copytree.global_excluded_files', []);

        $loader = new FileLoader($this->tempDir);
        $files = $loader->loadFiles();

        // Map the returned files to their relative paths.
        $paths = array_map(function (SplFileInfo $file) {
            return $file->getRelativePathname();
        }, $files);

        $this->assertContains('file1.txt', $paths);
        $this->assertContains('subdir/file2.txt', $paths);
    }

    public function test_load_files_filters_by_global_excluded_directories(): void
    {
        // Configure to exclude any directory named "excludeGlobal".
        Config::set('copytree.global_excluded_directories', ['excludeGlobal']);
        Config::set('copytree.base_path_excluded_directories', []);
        Config::set('copytree.global_excluded_files', []);

        // Create a directory that should be excluded.
        mkdir($this->tempDir.'/excludeGlobal', 0777, true);
        file_put_contents($this->tempDir.'/excludeGlobal/excluded.txt', 'Should be excluded');

        // Also create a directory that should be included.
        mkdir($this->tempDir.'/includeDir', 0777, true);
        file_put_contents($this->tempDir.'/includeDir/included.txt', 'Should be included');

        $loader = new FileLoader($this->tempDir);
        $files = $loader->loadFiles();

        $paths = array_map(fn (SplFileInfo $file) => $file->getRelativePathname(), $files);

        $this->assertNotContains('excludeGlobal/excluded.txt', $paths);
        $this->assertContains('includeDir/included.txt', $paths);
    }

    public function test_load_files_filters_by_global_excluded_files(): void
    {
        // Configure to exclude a file named "exclude.log".
        Config::set('copytree.global_excluded_directories', []);
        Config::set('copytree.base_path_excluded_directories', []);
        Config::set('copytree.global_excluded_files', ['exclude.log']);

        // Create files.
        file_put_contents($this->tempDir.'/exclude.log', 'This log file should be excluded.');
        file_put_contents($this->tempDir.'/include.txt', 'This file should be included.');

        $loader = new FileLoader($this->tempDir);
        $files = $loader->loadFiles();

        $paths = array_map(fn (SplFileInfo $file) => $file->getRelativePathname(), $files);

        $this->assertNotContains('exclude.log', $paths);
        $this->assertContains('include.txt', $paths);
    }

    public function test_load_files_filters_by_base_path_excluded_directories(): void
    {
        // Configure the base path exclusion.
        Config::set('copytree.global_excluded_directories', []);
        Config::set('copytree.base_path_excluded_directories', ['excludeBase']);
        Config::set('copytree.global_excluded_files', []);

        // Create a directory under the base path that should be excluded.
        mkdir($this->tempDir.'/excludeBase', 0777, true);
        file_put_contents($this->tempDir.'/excludeBase/hidden.txt', 'Hidden file');

        // Create another directory that should not be excluded.
        mkdir($this->tempDir.'/normal', 0777, true);
        file_put_contents($this->tempDir.'/normal/visible.txt', 'Visible file');

        $loader = new FileLoader($this->tempDir);
        $files = $loader->loadFiles();

        $paths = array_map(fn (SplFileInfo $file) => $file->getRelativePathname(), $files);

        $this->assertNotContains('excludeBase/hidden.txt', $paths);
        $this->assertContains('normal/visible.txt', $paths);
    }

    public function test_load_files_applies_max_depth(): void
    {
        // No exclusions.
        Config::set('copytree.global_excluded_directories', []);
        Config::set('copytree.base_path_excluded_directories', []);
        Config::set('copytree.global_excluded_files', []);

        // Create files at various depths.
        file_put_contents($this->tempDir.'/root.txt', 'Root file');

        mkdir($this->tempDir.'/level1', 0777, true);
        file_put_contents($this->tempDir.'/level1/file1.txt', 'Level 1 file');

        mkdir($this->tempDir.'/level1/level2', 0777, true);
        file_put_contents($this->tempDir.'/level1/level2/file2.txt', 'Level 2 file');

        $loader = new FileLoader($this->tempDir);

        // With maxDepth = 0, only root-level files should be returned.
        $filesDepth0 = $loader->loadFiles(0);
        $pathsDepth0 = array_map(fn (SplFileInfo $file) => $file->getRelativePathname(), $filesDepth0);
        $this->assertContains('root.txt', $pathsDepth0);
        $this->assertNotContains('level1/file1.txt', $pathsDepth0);
        $this->assertNotContains('level1/level2/file2.txt', $pathsDepth0);

        // With maxDepth = 1, files in root and immediate subdirectories should be returned.
        $filesDepth1 = $loader->loadFiles(1);
        $pathsDepth1 = array_map(fn (SplFileInfo $file) => $file->getRelativePathname(), $filesDepth1);
        $this->assertContains('root.txt', $pathsDepth1);
        $this->assertContains('level1/file1.txt', $pathsDepth1);
        $this->assertNotContains('level1/level2/file2.txt', $pathsDepth1);
    }
}
