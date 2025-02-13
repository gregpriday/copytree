<?php

namespace Tests\Unit\Pipeline;

use App\Pipeline\RulesetFilter;
use Symfony\Component\Finder\SplFileInfo;
use Tests\TestCase;

class RulesetFilterAdvancedOperatorsTest extends TestCase
{
    /**
     * A temporary directory for test files.
     */
    protected string $tempDir;

    protected function setUp(): void
    {
        parent::setUp();
        // Create a unique temporary directory for tests.
        $this->tempDir = sys_get_temp_dir().'/ruleset_filter_advanced_test_'.uniqid();
        mkdir($this->tempDir, 0777, true);
    }

    protected function tearDown(): void
    {
        $this->removeDirectory($this->tempDir);
        parent::tearDown();
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
     * Helper to create a file with a given relative path and content.
     *
     * Returns a Symfony Finder SplFileInfo instance.
     */
    protected function createTestFile(string $relativePath, string $content): SplFileInfo
    {
        $fullPath = $this->tempDir.'/'.$relativePath;
        $dir = dirname($fullPath);
        if (! is_dir($dir)) {
            mkdir($dir, 0777, true);
        }
        file_put_contents($fullPath, $content);
        $relativeDir = dirname($relativePath);
        if ($relativeDir === '.') {
            $relativeDir = '';
        }

        return new SplFileInfo($fullPath, $relativeDir, $relativePath);
    }

    public function test_starts_with_any_operator_accepts_file_in_prefixes()
    {
        // Create a file in the "src" folder.
        $file = $this->createTestFile('src/foo.txt', 'sample content');
        // Rule: folder must start with any of ["src", "lib"]
        $rules = [
            [
                ['folder', 'startsWithAny', ['src', 'lib']],
            ],
        ];
        $filter = new RulesetFilter($rules);
        $this->assertTrue($filter->accept($file), 'File in folder "src" should be accepted with startsWithAny rule.');
    }

    public function test_starts_with_any_operator_rejects_file_not_matching()
    {
        // Create a file in the "vendor" folder.
        $file = $this->createTestFile('vendor/foo.txt', 'sample content');
        $rules = [
            [
                ['folder', 'startsWithAny', ['src', 'lib']],
            ],
        ];
        $filter = new RulesetFilter($rules);
        $this->assertFalse($filter->accept($file), 'File in folder "vendor" should be rejected with startsWithAny rule.');
    }

    public function test_not_starts_with_any_operator_rejects_file_that_matches()
    {
        // Create a file with basename "TestFile.php"
        $file = $this->createTestFile('TestFile.php', 'sample content');
        $rules = [
            [
                // "notStartsWithAny" should negate if the basename starts with any given prefix.
                ['basename', 'notStartsWithAny', ['Test', 'Spec']],
            ],
        ];
        $filter = new RulesetFilter($rules);
        $this->assertFalse($filter->accept($file), 'File with basename starting with "Test" should be rejected by notStartsWithAny rule.');
    }

    public function test_not_starts_with_any_operator_accepts_file_that_does_not_match()
    {
        $file = $this->createTestFile('MainFile.php', 'sample content');
        $rules = [
            [
                ['basename', 'notStartsWithAny', ['Test', 'Spec']],
            ],
        ];
        $filter = new RulesetFilter($rules);
        $this->assertTrue($filter->accept($file), 'File with basename not starting with "Test" or "Spec" should be accepted by notStartsWithAny rule.');
    }

    public function test_starts_with_all_operator_accepts_file_matching_all_prefixes()
    {
        // Create a file in folder "src"
        $file = $this->createTestFile('src/module/file.txt', 'sample content');
        // Rule: folder must start with all of ["s", "sr", "src"]
        $rules = [
            [
                ['folder', 'startsWithAll', ['s', 'sr', 'src']],
            ],
        ];
        $filter = new RulesetFilter($rules);
        $this->assertTrue($filter->accept($file), 'File in folder "src" should be accepted with startsWithAll rule matching all prefixes.');
    }

    public function test_starts_with_all_operator_rejects_file_not_matching_all_prefixes()
    {
        $file = $this->createTestFile('src/module/file.txt', 'sample content');
        // Rule: folder must start with all of ["src", "lib"]
        $rules = [
            [
                ['folder', 'startsWithAll', ['src', 'lib']],
            ],
        ];
        $filter = new RulesetFilter($rules);
        $this->assertFalse($filter->accept($file), 'File in folder "src" should be rejected with startsWithAll rule not matching all prefixes.');
    }

    public function test_ends_with_any_operator_accepts_file_with_valid_suffix()
    {
        $file = $this->createTestFile('foo.php', 'sample content');
        $rules = [
            [
                ['basename', 'endsWithAny', ['.php', '.js']],
            ],
        ];
        $filter = new RulesetFilter($rules);
        $this->assertTrue($filter->accept($file), 'File "foo.php" should be accepted with endsWithAny rule.');
    }

    public function test_ends_with_any_operator_rejects_file_without_valid_suffix()
    {
        $file = $this->createTestFile('foo.txt', 'sample content');
        $rules = [
            [
                ['basename', 'endsWithAny', ['.php', '.js']],
            ],
        ];
        $filter = new RulesetFilter($rules);
        $this->assertFalse($filter->accept($file), 'File "foo.txt" should be rejected with endsWithAny rule.');
    }

    public function test_not_ends_with_any_operator_rejects_file_with_forbidden_suffix()
    {
        $file = $this->createTestFile('TestFile.php', 'sample content');
        $rules = [
            [
                ['basename', 'notEndsWithAny', ['.php']],
            ],
        ];
        $filter = new RulesetFilter($rules);
        $this->assertFalse($filter->accept($file), 'File "TestFile.php" should be rejected by notEndsWithAny rule.');
    }

    public function test_not_ends_with_any_operator_accepts_file_without_forbidden_suffix()
    {
        $file = $this->createTestFile('TestFile.txt', 'sample content');
        $rules = [
            [
                ['basename', 'notEndsWithAny', ['.php']],
            ],
        ];
        $filter = new RulesetFilter($rules);
        $this->assertTrue($filter->accept($file), 'File "TestFile.txt" should be accepted by notEndsWithAny rule.');
    }

    public function test_contains_any_operator_accepts_if_any_match()
    {
        // Create a file with content that includes "confidential"
        $file = $this->createTestFile('notes.txt', 'This file contains confidential information.');
        $rules = [
            [
                ['contents', 'containsAny', ['secret', 'confidential']],
            ],
        ];
        $filter = new RulesetFilter($rules);
        $this->assertTrue($filter->accept($file), 'File should be accepted if contents contain any of the given substrings.');
    }

    public function test_not_contains_any_operator_accepts_if_none_match()
    {
        $file = $this->createTestFile('notes.txt', 'This file is public information.');
        $rules = [
            [
                ['contents', 'notContainsAny', ['secret', 'confidential']],
            ],
        ];
        $filter = new RulesetFilter($rules);
        $this->assertTrue($filter->accept($file), 'File should be accepted if contents do not contain any forbidden substrings.');
    }

    public function test_not_contains_any_operator_rejects_if_any_match()
    {
        $file = $this->createTestFile('notes.txt', 'This file contains secret details.');
        $rules = [
            [
                ['contents', 'notContainsAny', ['secret', 'confidential']],
            ],
        ];
        $filter = new RulesetFilter($rules);
        $this->assertFalse($filter->accept($file), 'File should be rejected if contents contain any forbidden substring.');
    }
}
