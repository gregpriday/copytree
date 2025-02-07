<?php

namespace Tests\Unit\Utilities\Git;

use App\Utilities\Git\GitIgnoreManager;
use PHPUnit\Framework\TestCase;
use RuntimeException;
use Symfony\Component\Finder\SplFileInfo;

class GitIgnoreManagerTest extends TestCase
{
    /**
     * The temporary directory used for testing.
     */
    private string $tempDir;

    /**
     * Create a unique temporary directory before each test.
     */
    protected function setUp(): void
    {
        $this->tempDir = sys_get_temp_dir().'/gitignore_test_'.uniqid();
        if (! mkdir($this->tempDir, 0777, true) && ! is_dir($this->tempDir)) {
            throw new RuntimeException(sprintf('Directory "%s" was not created', $this->tempDir));
        }
    }

    /**
     * Remove the temporary directory and its contents after each test.
     */
    protected function tearDown(): void
    {
        $this->removeDirectory($this->tempDir);
    }

    /**
     * Recursively remove a directory and its contents.
     */
    private function removeDirectory(string $dir): void
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
     * Create a test file (or directory if needed) relative to the temporary directory.
     *
     * @param  string  $relativePath  The path relative to the temporary directory.
     * @param  string  $content  The content to write (ignored if creating a directory).
     * @param  bool  $isDir  Whether to create a directory instead of a file.
     * @return string The full path of the created file or directory.
     */
    private function createTestItem(string $relativePath, string $content = '', bool $isDir = false): string
    {
        $fullPath = $this->tempDir.'/'.$relativePath;
        $dir = $isDir ? $fullPath : dirname($fullPath);
        if (! is_dir($dir)) {
            mkdir($dir, 0777, true);
        }
        if (! $isDir) {
            file_put_contents($fullPath, $content);
        }

        return $fullPath;
    }

    /**
     * Test that the constructor throws an exception when the base path does not exist.
     */
    public function test_constructor_throws_exception_for_invalid_base_path(): void
    {
        $this->expectException(RuntimeException::class);
        new GitIgnoreManager($this->tempDir.'/nonexistent');
    }

    /**
     * Test that a top‐level .gitignore correctly excludes files.
     */
    public function test_accept_top_level_gitignore(): void
    {
        // Create a top-level .gitignore with a rule to ignore "exclude.txt"
        $gitignoreContent = <<<'EOD'
# Ignore exclude.txt file
exclude.txt
EOD;
        $this->createTestItem('.gitignore', $gitignoreContent);

        // Create two files: one that should be excluded and one that should be included.
        $fileExclude = $this->createTestItem('exclude.txt', 'should be ignored');
        $fileInclude = $this->createTestItem('include.txt', 'should be included');

        $manager = new GitIgnoreManager($this->tempDir);

        $excludeInfo = new SplFileInfo($fileExclude, '', 'exclude.txt');
        $includeInfo = new SplFileInfo($fileInclude, '', 'include.txt');

        $this->assertFalse($manager->accept($excludeInfo), 'File "exclude.txt" should be ignored by the top-level .gitignore rule.');
        $this->assertTrue($manager->accept($includeInfo), 'File "include.txt" should be accepted.');
    }

    /**
     * Test that a .gitignore file placed in a subdirectory only affects files in that subdirectory.
     */
    public function test_accept_subdirectory_gitignore(): void
    {
        // Create a subdirectory "sub" and a .gitignore inside it that ignores "temp.txt"
        $this->createTestItem('sub/.gitignore', 'temp.txt');
        $fileTemp = $this->createTestItem('sub/temp.txt', 'should be ignored');
        $fileKeep = $this->createTestItem('sub/keep.txt', 'should be included');

        $manager = new GitIgnoreManager($this->tempDir);

        $tempInfo = new SplFileInfo($fileTemp, 'sub', 'sub/temp.txt');
        $keepInfo = new SplFileInfo($fileKeep, 'sub', 'sub/keep.txt');

        $this->assertFalse($manager->accept($tempInfo), 'File "sub/temp.txt" should be ignored by the subdirectory .gitignore.');
        $this->assertTrue($manager->accept($keepInfo), 'File "sub/keep.txt" should be accepted.');
    }

    /**
     * Test that negation rules work correctly.
     */
    public function test_negation_rule(): void
    {
        // Create a .gitignore with a rule to ignore all .log files except "keep.log"
        $gitignoreContent = <<<'EOD'
*.log
!keep.log
EOD;
        $this->createTestItem('.gitignore', $gitignoreContent);

        $fileError = $this->createTestItem('error.log', 'error log content');
        $fileKeep = $this->createTestItem('keep.log', 'keep log content');

        $manager = new GitIgnoreManager($this->tempDir);

        $errorInfo = new SplFileInfo($fileError, '', 'error.log');
        $keepInfo = new SplFileInfo($fileKeep, '', 'keep.log');

        $this->assertFalse($manager->accept($errorInfo), 'File "error.log" should be ignored due to the *.log rule.');
        $this->assertTrue($manager->accept($keepInfo), 'File "keep.log" should be re-included due to the negation rule.');
    }

    /**
     * Test that a directory-only rule (a rule ending with a slash) is applied to directories.
     *
     * Note: According to this implementation, a rule such as "build/" will mark the directory "build"
     * as ignored AND WILL ALSO IGNORE FILES INSIDE.
     */
    public function test_directory_only_rule(): void
    {
        // Create a .gitignore with a directory-only rule
        $gitignoreContent = <<<'EOD'
build/
EOD;
        $this->createTestItem('.gitignore', $gitignoreContent);

        // Create a directory "build" and a file inside it.
        $buildDir = $this->createTestItem('build', '', true);
        $fileInside = $this->createTestItem('build/output.txt', 'output content');

        $manager = new GitIgnoreManager($this->tempDir);

        // Check the directory "build" itself.
        $dirInfo = new SplFileInfo($buildDir, '', 'build');
        $this->assertFalse($manager->accept($dirInfo), 'Directory "build" should be ignored due to the directory-only rule.');

        // Check a file inside "build".  It SHOULD be ignored.
        $fileInfo = new SplFileInfo($fileInside, 'build', 'build/output.txt');
        $this->assertFalse($manager->accept($fileInfo), 'A file inside "build" is ignored because the directory is ignored.'); // Corrected assertion
    }

    /**
     * Test that ignoring a directory also ignores all files and subdirectories within it.
     */
    public function test_directory_only_rule_ignores_contents(): void
    {
        // Create a .gitignore with a directory-only rule
        $gitignoreContent = <<<'EOD'
build/
EOD;
        $this->createTestItem('.gitignore', $gitignoreContent);

        // Create a directory "build" and files/subdirectories inside it.
        $this->createTestItem('build', '', true);
        $fileInside1 = $this->createTestItem('build/output1.txt', 'output content 1');
        $this->createTestItem('build/subdir', '', true);
        $fileInside2 = $this->createTestItem('build/subdir/output2.txt', 'output content 2');

        // Also create a file *outside* the ignored directory.
        $fileOutside = $this->createTestItem('src/safe.txt', 'safe file');

        $manager = new GitIgnoreManager($this->tempDir);

        // Check files inside "build".
        $fileInfo1 = new SplFileInfo($fileInside1, 'build', 'build/output1.txt');
        $fileInfo2 = new SplFileInfo($fileInside2, 'build/subdir', 'build/subdir/output2.txt');

        $this->assertFalse($manager->accept($fileInfo1), 'File "build/output1.txt" should be ignored.');
        $this->assertFalse($manager->accept($fileInfo2), 'File "build/subdir/output2.txt" should be ignored.');

        // Check the file outside.
        $outsideInfo = new SplFileInfo($fileOutside, 'src', 'src/safe.txt');
        $this->assertTrue($manager->accept($outsideInfo), 'File "src/safe.txt" should be accepted.');
    }

    /**
     * Test that a rule with a leading slash only matches files relative to the location of the .gitignore.
     */
    public function test_has_leading_slash_rule(): void
    {
        // Create a .gitignore with a rule that has a leading slash
        $gitignoreContent = <<<'EOD'
/config
EOD;
        $this->createTestItem('.gitignore', $gitignoreContent);

        // Create "config" in the root and "sub/config" in a subdirectory.
        $fileConfigRoot = $this->createTestItem('config', 'root config');
        $fileConfigSub = $this->createTestItem('sub/config', 'sub config');

        $manager = new GitIgnoreManager($this->tempDir);

        $rootInfo = new SplFileInfo($fileConfigRoot, '', 'config');
        $subInfo = new SplFileInfo($fileConfigSub, 'sub', 'sub/config');

        $this->assertFalse($manager->accept($rootInfo), 'File "config" in the root should be ignored by a leading-slash rule.');
        $this->assertTrue($manager->accept($subInfo), 'File "sub/config" should be accepted since the leading-slash rule does not apply.');
    }

    /**
     * Test that a pattern containing a double asterisk (“**”) is correctly converted and applied.
     */
    public function test_double_asterisk_pattern(): void
    {
        // Create a .gitignore with a rule using the "**" pattern.
        $gitignoreContent = <<<'EOD'
src/**/temp.txt
EOD;
        $this->createTestItem('.gitignore', $gitignoreContent);

        // Create several test files:
        // - "src/temp.txt" should match.
        // - "src/dir/temp.txt" should match.
        // - "src/dir/other.txt" should not match.
        $fileMatch1 = $this->createTestItem('src/temp.txt', 'match');
        $fileMatch2 = $this->createTestItem('src/dir/temp.txt', 'match');
        $fileNoMatch = $this->createTestItem('src/dir/other.txt', 'no match');

        $manager = new GitIgnoreManager($this->tempDir);

        $infoMatch1 = new SplFileInfo($fileMatch1, '', 'src/temp.txt');
        $infoMatch2 = new SplFileInfo($fileMatch2, 'src/dir', 'src/dir/temp.txt');
        $infoNoMatch = new SplFileInfo($fileNoMatch, 'src/dir', 'src/dir/other.txt');

        $this->assertFalse($manager->accept($infoMatch1), '"src/temp.txt" should be ignored.');
        $this->assertFalse($manager->accept($infoMatch2), '"src/dir/temp.txt" should be ignored.');
        $this->assertTrue($manager->accept($infoNoMatch), '"src/dir/other.txt" should be accepted.');
    }

    /**
     * Test more complex scenarios involving the double asterisk pattern.
     */
    public function test_double_asterisk_advanced(): void
    {
        $gitignoreContent = <<<'EOD'
**/temp.txt
src/**
src/**/*.log
a/**/b/c
**/d/e/**
EOD;
        $this->createTestItem('.gitignore', $gitignoreContent);

        $manager = new GitIgnoreManager($this->tempDir);

        // **/temp.txt
        $this->assertFalse(
            $manager->accept(new SplFileInfo($this->createTestItem('temp.txt'), '', 'temp.txt')),
            'temp.txt should be ignored (**/temp.txt at root)'
        );
        $this->assertFalse(
            $manager->accept(new SplFileInfo($this->createTestItem('a/temp.txt'), 'a', 'a/temp.txt')),
            'a/temp.txt should be ignored (**/temp.txt in subdir)'
        );
        $this->assertFalse(
            $manager->accept(new SplFileInfo($this->createTestItem('a/b/temp.txt'), 'a/b', 'a/b/temp.txt')),
            'a/b/temp.txt should be ignored (**/temp.txt deeper)'
        );

        // src/**
        $this->assertFalse(
            $manager->accept(new SplFileInfo($this->createTestItem('src/file.txt'), 'src', 'src/file.txt')),
            'src/file.txt should be ignored (src/**)'
        );
        $this->assertFalse(
            $manager->accept(new SplFileInfo($this->createTestItem('src/a/file.txt'), 'src/a', 'src/a/file.txt')),
            'src/a/file.txt should be ignored (src/**)'
        );
        // Update: src/a/info.txt should be ignored too because it matches "src/**"
        $this->assertFalse(
            $manager->accept(new SplFileInfo($this->createTestItem('src/a/info.txt'), 'src/a', 'src/a/info.txt')),
            'src/a/info.txt should be ignored (matches src/**)'
        );

        // src/**/*.log
        $this->assertFalse(
            $manager->accept(new SplFileInfo($this->createTestItem('src/error.log'), 'src', 'src/error.log')),
            'src/error.log should be ignored (src/**/*.log)'
        );
        $this->assertFalse(
            $manager->accept(new SplFileInfo($this->createTestItem('src/a/debug.log'), 'src/a', 'src/a/debug.log')),
            'src/a/debug.log should be ignored (src/**/*.log)'
        );
        // With the current rules, all files under src/ are ignored, so a file like info.txt is ignored.

        // a/**/b/c
        $this->assertFalse(
            $manager->accept(new SplFileInfo($this->createTestItem('a/b/c'), 'a/b', 'a/b/c')),
            'a/b/c should be ignored (a/**/b/c)'
        );
        $this->assertFalse(
            $manager->accept(new SplFileInfo($this->createTestItem('a/x/b/c'), 'a/x/b', 'a/x/b/c')),
            'a/x/b/c should be ignored (a/**/b/c)'
        );
        $this->assertFalse(
            $manager->accept(new SplFileInfo($this->createTestItem('a/x/y/b/c'), 'a/x/y/b', 'a/x/y/b/c')),
            'a/x/y/b/c should be ignored (a/**/b/c)'
        );
        $this->assertTrue(
            $manager->accept(new SplFileInfo($this->createTestItem('a/b/d'), 'a/b', 'a/b/d')),
            'a/b/d should be accepted (does not match a/**/b/c)'
        );

        // **/d/e/**
        $this->assertFalse(
            $manager->accept(new SplFileInfo($this->createTestItem('d/e/file.txt'), 'd/e', 'd/e/file.txt')),
            'd/e/file.txt should be ignored (**/d/e/**)'
        );
        $this->assertFalse(
            $manager->accept(new SplFileInfo($this->createTestItem('x/d/e/file.txt'), 'x/d/e', 'x/d/e/file.txt')),
            'x/d/e/file.txt should be ignored (**/d/e/**)'
        );
        $this->assertFalse(
            $manager->accept(new SplFileInfo($this->createTestItem('x/y/d/e/z/file.txt'), 'x/y/d/e/z', 'x/y/d/e/z/file.txt')),
            'x/y/d/e/z/file.txt should be ignored (**/d/e/**)'
        );
        $this->assertTrue(
            $manager->accept(new SplFileInfo($this->createTestItem('d/f/file.txt'), 'd/f', 'd/f/file.txt')),
            'd/f/file.txt should be accepted (**/d/e/** does not match)'
        );
    }

    /**
     * Test interactions between multiple .gitignore files at different levels.
     */
    public function test_nested_gitignore_files(): void
    {
        // Top-level .gitignore: Ignore all .log files
        $this->createTestItem('.gitignore', '*.log');
        // Subdirectory .gitignore: Re-include important.log
        $this->createTestItem('logs/.gitignore', '!important.log');
        // Deeper subdirectory .gitignore: Ignore specific.log
        $this->createTestItem('logs/deep/.gitignore', 'specific.log');

        $manager = new GitIgnoreManager($this->tempDir);

        // Files in the root
        $this->assertFalse($manager->accept(new SplFileInfo($this->createTestItem('error.log'), '', 'error.log')), 'Root error.log should be ignored');
        $this->assertTrue($manager->accept(new SplFileInfo($this->createTestItem('main.txt'), '', 'main.txt')), 'Root main.txt should be accepted');

        // Files in the 'logs' subdirectory
        $this->assertTrue($manager->accept(new SplFileInfo($this->createTestItem('logs/important.log'), 'logs', 'logs/important.log')), 'logs/important.log should be re-included');
        $this->assertFalse($manager->accept(new SplFileInfo($this->createTestItem('logs/debug.log'), 'logs', 'logs/debug.log')), 'logs/debug.log should be ignored');

        // Files in the 'logs/deep' subdirectory
        $this->assertTrue($manager->accept(new SplFileInfo($this->createTestItem('logs/deep/important.log'), 'logs/deep', 'logs/deep/important.log')), 'logs/deep/important.log should still be included');
        $this->assertFalse($manager->accept(new SplFileInfo($this->createTestItem('logs/deep/specific.log'), 'logs/deep', 'logs/deep/specific.log')), 'logs/deep/specific.log should be ignored');
        $this->assertFalse($manager->accept(new SplFileInfo($this->createTestItem('logs/deep/other.log'), 'logs/deep', 'logs/deep/other.log')), 'logs/deep/other.log should be ignored (inherited)');
    }

    /**
     * Test edge cases with slashes, wildcards, and directory/file distinctions.
     */
    public function test_edge_cases_slashes_wildcards(): void
    {
        $gitignoreContent = <<<'EOD'
/foo/bar
baz/*.txt
qux?/
EOD;
        $this->createTestItem('.gitignore', $gitignoreContent);

        $manager = new GitIgnoreManager($this->tempDir);

        // /foo/bar
        $this->assertFalse($manager->accept(new SplFileInfo($this->createTestItem('foo/bar', ''), 'foo', 'foo/bar')), 'foo/bar should be ignored');
        $this->assertTrue($manager->accept(new SplFileInfo($this->createTestItem('a/foo/bar', ''), 'a/foo', 'a/foo/bar')), 'a/foo/bar should be accepted (leading slash)');
        $this->assertTrue($manager->accept(new SplFileInfo($this->createTestItem('foo/baz', ''), 'foo', 'foo/baz')), 'foo/baz should be accepted');

        // baz/*.txt
        $this->assertFalse($manager->accept(new SplFileInfo($this->createTestItem('baz/file.txt', ''), 'baz', 'baz/file.txt')), 'baz/file.txt should be ignored');
        $this->assertTrue($manager->accept(new SplFileInfo($this->createTestItem('baz/file.log', ''), 'baz', 'baz/file.log')), 'baz/file.log should be accepted');
        $this->assertTrue($manager->accept(new SplFileInfo($this->createTestItem('a/baz/file.txt', ''), 'a/baz', 'a/baz/file.txt')), 'a/baz/file.txt should be accepted');

        // qux?/  (directory-only with ?)
        $this->assertFalse($manager->accept(new SplFileInfo($this->createTestItem('qux1', '', true), '', 'qux1')), 'qux1/ should be ignored');
        $this->assertFalse($manager->accept(new SplFileInfo($this->createTestItem('quxa', '', true), '', 'quxa')), 'quxa/ should be ignored');
        $this->assertFalse($manager->accept(new SplFileInfo($this->createTestItem('qux1/file.txt', ''), 'qux1', 'qux1/file.txt')), 'qux1/file.txt should be ignored because qux1/ is ignored.');  // Corrected: Should be assertFalse
        $this->assertTrue($manager->accept(new SplFileInfo($this->createTestItem('qux', ''), '', 'qux')), 'qux should be accepted');
        $this->assertTrue($manager->accept(new SplFileInfo($this->createTestItem('qux12', ''), '', 'qux12')), 'qux12 should be accepted');
    }

    /**
     * Test case sensitivity (and insensitivity) of matching.
     */
    public function test_case_sensitivity(): void
    {
        $this->createTestItem('.gitignore', 'testfile.txt');

        // Case-sensitive manager
        $managerSensitive = new GitIgnoreManager($this->tempDir, true);
        $this->assertFalse($managerSensitive->accept(new SplFileInfo($this->createTestItem('testfile.txt'), '', 'testfile.txt')), 'Case-sensitive match');
        $this->assertTrue($managerSensitive->accept(new SplFileInfo($this->createTestItem('TestFile.txt'), '', 'TestFile.txt')), 'Case-sensitive mismatch');

        // Case-insensitive manager
        $managerInsensitive = new GitIgnoreManager($this->tempDir, false);
        $this->assertFalse($managerInsensitive->accept(new SplFileInfo($this->createTestItem('testfile.txt'), '', 'testfile.txt')), 'Case-insensitive match');
        $this->assertFalse($managerInsensitive->accept(new SplFileInfo($this->createTestItem('TestFile.txt'), '', 'TestFile.txt')), 'Case-insensitive match (uppercase)');
    }

    /**
     * Test behavior with empty or comment-only .gitignore files.
     */
    public function test_empty_and_comment_only_gitignore(): void
    {
        // Empty .gitignore
        $this->createTestItem('.gitignore', '');
        $managerEmpty = new GitIgnoreManager($this->tempDir);
        $this->assertTrue($managerEmpty->accept(new SplFileInfo($this->createTestItem('file.txt'), '', 'file.txt')), 'Empty .gitignore should accept all');

        // Comment-only .gitignore
        $this->createTestItem('comments/.gitignore', "# This is a comment\n  # Another comment");
        $managerComments = new GitIgnoreManager($this->tempDir);
        $this->assertTrue($managerComments->accept(new SplFileInfo($this->createTestItem('comments/file.txt'), 'comments', 'comments/file.txt')), 'Comment-only .gitignore should accept all');
    }

    /**
     * Test files with spaces and other special characters in their names.
     */
    public function test_files_with_special_characters(): void
    {
        $gitignoreContent = <<<'EOD'
# Ignore files with spaces
file\ with\ spaces.txt
# Ignore files starting with a dot
.hiddenfile
# Ignore files with brackets
[special]file.txt
EOD;
        $this->createTestItem('.gitignore', $gitignoreContent);
        $manager = new GitIgnoreManager($this->tempDir);

        $this->assertFalse($manager->accept(new SplFileInfo($this->createTestItem('file with spaces.txt'), '', 'file with spaces.txt')), 'File with spaces should be ignored.');
        $this->assertFalse($manager->accept(new SplFileInfo($this->createTestItem('.hiddenfile'), '', '.hiddenfile')), 'File starting with a dot should be ignored');
        $this->assertFalse($manager->accept(new SplFileInfo($this->createTestItem('[special]file.txt'), '', '[special]file.txt')), 'File with brackets should be ignored.');

        $this->assertTrue($manager->accept(new SplFileInfo($this->createTestItem('other_file.txt'), '', 'other_file.txt')), 'Normal file should be accepted.');
    }

    /**
     * Test with Leading and Trailing Spaces
     */
    public function test_leading_trailing_spaces(): void
    {
        $gitignoreContent = <<<'EOD'
  ignore_me.txt
	  also_ignore.log
EOD;
        $this->createTestItem('.gitignore', $gitignoreContent);
        $manager = new GitIgnoreManager($this->tempDir);

        $this->assertFalse($manager->accept(new SplFileInfo($this->createTestItem('ignore_me.txt'), '', 'ignore_me.txt')), 'Should ignore with leading/trailing spaces.');
        $this->assertFalse($manager->accept(new SplFileInfo($this->createTestItem('also_ignore.log'), '', 'also_ignore.log')), 'Should also ignore with tabs.');

        $this->assertTrue($manager->accept(new SplFileInfo($this->createTestItem('  ignore_me.txt  '), '', '  ignore_me.txt  ')), 'Should not ignore files that are just spaces and the filename.');
    }
}
