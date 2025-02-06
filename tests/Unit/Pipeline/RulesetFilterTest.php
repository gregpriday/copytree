<?php

namespace Tests\Unit\Pipeline;

use App\Pipeline\RulesetFilter;
use Symfony\Component\Finder\SplFileInfo;
use Tests\TestCase;

class RulesetFilterTest extends TestCase
{
    /**
     * A temporary directory where test files will be created.
     */
    protected string $tempDir;

    protected function setUp(): void
    {
        // Create a unique temporary directory for the tests.
        $this->tempDir = sys_get_temp_dir().'/ruleset_filter_test_'.uniqid();
        mkdir($this->tempDir, 0777, true);
    }

    protected function tearDown(): void
    {
        $this->removeDirectory($this->tempDir);
    }

    /**
     * Recursively removes a directory.
     */
    protected function removeDirectory(string $dir): void
    {
        if (! is_dir($dir)) {
            return;
        }
        $files = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($files as $file) {
            if ($file->isDir()) {
                rmdir($file->getRealPath());
            } else {
                unlink($file->getRealPath());
            }
        }
        rmdir($dir);
    }

    /**
     * Helper to create a file with given relative path and content.
     *
     * Returns a Symfony Finder SplFileInfo instance with a specified
     * relative path and pathname.
     */
    protected function createTestFile(string $relativePath, string $content): SplFileInfo
    {
        $fullPath = $this->tempDir.'/'.$relativePath;
        $dir = dirname($fullPath);
        if (! is_dir($dir)) {
            mkdir($dir, 0777, true);
        }
        file_put_contents($fullPath, $content);
        // When constructing a Symfony SplFileInfo, you can pass:
        // - The full path,
        // - The relative path (the directory part relative to a base directory),
        // - The relative pathname (the complete relative path).
        $relativeDir = dirname($relativePath);
        if ($relativeDir === '.') {
            $relativeDir = '';
        }

        return new SplFileInfo($fullPath, $relativeDir, $relativePath);
    }

    public function test_accept_without_rules()
    {
        // With no rules provided, the file should be accepted.
        $file = $this->createTestFile('test.txt', 'hello world');
        $filter = new RulesetFilter;
        $this->assertTrue($filter->accept($file), 'File should be accepted if no rules are provided.');
    }

    public function test_always_exclude()
    {
        // If the file’s relative path matches an "always exclude" pattern, it must be rejected.
        $file = $this->createTestFile('test.txt', 'hello world');
        $filter = new RulesetFilter([], [], ['exclude' => ['*.txt']]);
        $this->assertFalse($filter->accept($file), 'File should be rejected due to always exclude pattern.');
    }

    public function test_always_include()
    {
        // If the file’s relative path matches an "always include" pattern, it must be accepted.
        $file = $this->createTestFile('important.txt', 'critical content');
        $filter = new RulesetFilter([], [], ['include' => ['important.txt']]);
        $this->assertTrue($filter->accept($file), 'File should be accepted due to always include pattern.');
    }

    public function test_global_exclude()
    {
        // Using a global exclude rule that rejects any file whose relative path contains "secret".
        $file = $this->createTestFile('src/secretFile.php', 'secret content');
        $globalExclude = [
            [
                ['path', 'contains', 'secret'],
            ],
        ];
        $filter = new RulesetFilter([], $globalExclude);
        $this->assertFalse($filter->accept($file), 'File should be rejected by global exclude rule.');
    }

    public function test_include_rules()
    {
        // With an include rule that requires the file extension to equal "php",
        // a PHP file should be accepted and a TXT file rejected.
        $filePhp = $this->createTestFile('src/file.php', 'php code');
        $fileTxt = $this->createTestFile('src/file.txt', 'text content');
        $rules = [
            [
                ['extension', '=', 'php'],
            ],
        ];
        $filter = new RulesetFilter($rules);
        $this->assertTrue($filter->accept($filePhp), 'PHP file should be accepted by include rule.');
        $this->assertFalse($filter->accept($fileTxt), 'TXT file should be rejected by include rule.');
    }

    public function test_complex_rule_set()
    {
        // Rule: The file must be in a folder starting with "src" and have a "php" extension.
        $rules = [
            [
                ['folder', 'startsWith', 'src'],
                ['extension', '=', 'php'],
            ],
        ];
        $filter = new RulesetFilter($rules);
        $fileInSrc = $this->createTestFile('src/file.php', 'php code');
        $fileNotInSrc = $this->createTestFile('tests/file.php', 'php test code');

        $this->assertTrue($filter->accept($fileInSrc), 'File in src with php extension should be accepted.');
        $this->assertFalse($filter->accept($fileNotInSrc), 'File not in src should be rejected.');
    }

    public function test_regex_rule()
    {
        // Rule: The basename must match the regular expression /^Test.*\.php$/.
        $rules = [
            [
                ['basename', 'regex', '/^Test.*\\.php$/'],
            ],
        ];
        $filter = new RulesetFilter($rules);
        $matchingFile = $this->createTestFile('src/TestFile.php', 'php code');
        $nonMatchingFile = $this->createTestFile('src/Example.php', 'php code');

        $this->assertTrue($filter->accept($matchingFile), 'File with basename matching regex should be accepted.');
        $this->assertFalse($filter->accept($nonMatchingFile), 'File not matching regex should be rejected.');
    }
}
