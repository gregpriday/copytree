<?php

namespace Tests\Unit\Utilities\Git;

use App\Utilities\Git\GitIgnoreManager;
use PHPUnit\Framework\TestCase;

class GitIgnoreManagerPatternTest extends TestCase
{
    public function test_convert_pattern_to_regex_for_double_asterisk()
    {
        // We'll use sys_get_temp_dir() as our base path for testing.
        $tempDir = sys_get_temp_dir();
        $manager = new GitIgnoreManager($tempDir);

        // Test pattern: should match both a file directly under src/foo and in deeper subdirectories.
        $pattern = 'src/foo/**/*.js';
        $regex = $manager->convertPatternToRegex($pattern);

        $this->assertMatchesRegularExpression(
            $regex,
            'src/foo/file.js',
            "Regex for pattern '$pattern' should match 'src/foo/file.js'"
        );
        $this->assertMatchesRegularExpression(
            $regex,
            'src/foo/app/file.js',
            "Regex for pattern '$pattern' should match 'src/foo/app/file.js'"
        );
        $this->assertDoesNotMatchRegularExpression(
            $regex,
            'src/bar/app/file.js',
            "Regex for pattern '$pattern' should not match 'src/bar/app/file.js'"
        );
    }

    public function test_match_pattern_functionality()
    {
        $tempDir = sys_get_temp_dir();
        $manager = new GitIgnoreManager($tempDir);

        // Test a pattern with a single wildcard.
        $this->assertTrue(
            $manager->matchPattern('foo/*.txt', 'foo/bar.txt'),
            "Pattern 'foo/*.txt' should match 'foo/bar.txt'"
        );
        $this->assertFalse(
            $manager->matchPattern('foo/*.txt', 'foo/baz/qux.txt'),
            "Pattern 'foo/*.txt' should not match 'foo/baz/qux.txt'"
        );

        // Test a pattern with a single-character wildcard.
        $this->assertTrue(
            $manager->matchPattern('foo/ba?.txt', 'foo/bar.txt'),
            "Pattern 'foo/ba?.txt' should match 'foo/bar.txt'"
        );
        $this->assertFalse(
            $manager->matchPattern('foo/ba?.txt', 'foo/baz.txt'),
            "Pattern 'foo/ba?.txt' should not match 'foo/baz.txt'"
        );
    }

    public function test_literal_match_without_wildcards()
    {
        $tempDir = sys_get_temp_dir();
        $manager = new GitIgnoreManager($tempDir);

        // Without any wildcards, matching should be literal.
        $this->assertTrue(
            $manager->matchPattern('exact/match.txt', 'exact/match.txt'),
            'Literal pattern should match exactly'
        );
        $this->assertFalse(
            $manager->matchPattern('exact/match.txt', 'exact/Match.txt'),
            'Literal pattern should be case sensitive'
        );
    }
}
