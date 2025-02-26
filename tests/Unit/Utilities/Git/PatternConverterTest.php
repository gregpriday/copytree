<?php

namespace Tests\Unit\Utilities\Git;

use App\Utilities\Git\PatternConverter;
use PHPUnit\Framework\TestCase;

class PatternConverterTest extends TestCase
{
    private PatternConverter $converter;

    protected function setUp(): void
    {
        parent::setUp();
        $this->converter = new PatternConverter;
    }

    /**
     * @dataProvider providerPatternMatching
     */
    public function test_pattern_matching(string $pattern, string $subject, bool $expected, string $message): void
    {
        $regex = $this->converter->patternToRegex($pattern);
        $result = (bool) preg_match($regex, $subject);
        $this->assertSame($expected, $result, "Pattern [$pattern] on subject [$subject]: ".$message);
    }

    public function providerPatternMatching(): array
    {
        return [
            // Simple literal patterns
            ['file.txt', 'file.txt', true, 'Exact match should succeed.'],
            ['file.txt', 'file.txt.bak', false, 'Non-exact match should fail.'],

            // Single asterisk wildcard
            ['*.txt', 'file.txt', true, "Pattern '*.txt' should match 'file.txt'."],
            ['*.txt', 'another.txt', true, "Pattern '*.txt' should match 'another.txt'."],
            ['*.txt', 'file.txt.bak', false, "Pattern '*.txt' should not match 'file.txt.bak'."],
            ['*.txt', 'dir/file.txt', false, "Wildcard '*' does not cross directory boundaries."],

            // Question mark wildcard
            ['file.?xt', 'file.txt', true, "Pattern 'file.?xt' should match 'file.txt'."],
            ['file.?xt', 'file.dxt', true, "Pattern 'file.?xt' should match 'file.dxt'."],
            ['file.?xt', 'file.xtt', false, "Pattern 'file.?xt' should not match 'file.xtt'."],

            // Directory wildcard (double asterisk at start)
            ['**/file.txt', 'file.txt', true, "Pattern '**/file.txt' should match file at root."],
            ['**/file.txt', 'dir/file.txt', true, "Pattern '**/file.txt' should match file in a one-level directory."],
            ['**/file.txt', 'dir/subdir/file.txt', true, "Pattern '**/file.txt' should match file in nested directories."],
            ['**/file.txt', 'file.txt.bak', false, "Pattern '**/file.txt' should not match file with extra extension."],

            // Double asterisk in the middle
            ['src/**/file.txt', 'src/file.txt', true, "Pattern 'src/**/file.txt' should match 'src/file.txt'."],
            ['src/**/file.txt', 'src/dir/file.txt', true, "Pattern 'src/**/file.txt' should match file one level deep."],
            ['src/**/file.txt', 'src/dir/subdir/file.txt', true, "Pattern 'src/**/file.txt' should match file in nested directories."],
            ['src/**/file.txt', 'other/file.txt', false, "Pattern 'src/**/file.txt' should not match file outside 'src/'."],

            // Brace expansion simple
            ['*.{js,css,html}', 'style.css', true, "Brace expansion: '*.css' should match 'style.css'."],
            ['*.{js,css,html}', 'script.js', true, "Brace expansion: '*.js' should match 'script.js'."],
            ['*.{js,css,html}', 'page.html', true, "Brace expansion: '*.html' should match 'page.html'."],
            ['*.{js,css,html}', 'file.txt', false, "Brace expansion: '*.txt' should not match for pattern '*.{js,css,html}'."],
            ['*.{js,css,html}', 'dir/style.css', false, "Wildcard '*' does not match directory separators."],

            // Complex pattern with both double asterisk and brace expansion
            ['src/**/*.{js,css,html}', 'src/style.css', true, "Complex pattern should match file directly under 'src/'."],
            ['src/**/*.{js,css,html}', 'src/js/script.js', true, "Complex pattern should match file one level deep in 'src/'."],
            ['src/**/*.{js,css,html}', 'src/views/components/page.html', true, 'Complex pattern should match file in nested directories.'],
            ['src/**/*.{js,css,html}', 'src/file.txt', false, 'Complex pattern should not match file with wrong extension.'],
            ['src/**/*.{js,css,html}', 'app/style.css', false, "Complex pattern should not match file outside 'src/'."],

            // Nested brace expansion
            ['{src,app}/js/*.{js,{ts,tsx}}', 'src/js/file.js', true, "Nested brace: should match 'src/js/file.js'."],
            ['{src,app}/js/*.{js,{ts,tsx}}', 'src/js/file.ts', true, "Nested brace: should match 'src/js/file.ts'."],
            ['{src,app}/js/*.{js,{ts,tsx}}', 'src/js/file.tsx', true, "Nested brace: should match 'src/js/file.tsx'."],
            ['{src,app}/js/*.{js,{ts,tsx}}', 'app/js/file.js', true, "Nested brace: should match 'app/js/file.js'."],
            ['{src,app}/js/*.{js,{ts,tsx}}', 'app/js/file.ts', true, "Nested brace: should match 'app/js/file.ts'."],
            ['{src,app}/js/*.{js,{ts,tsx}}', 'lib/js/file.js', false, 'Nested brace: should not match file in wrong top directory.'],
            ['{src,app}/js/*.{js,{ts,tsx}}', 'src/css/file.js', false, 'Nested brace: should not match file in wrong subdirectory.'],
            ['{src,app}/js/*.{js,{ts,tsx}}', 'src/js/file.css', false, 'Nested brace: should not match file with wrong extension.'],

            // Escaped characters
            ['file\\*.txt', 'file*.txt', true, 'Escaped asterisk: should match literal asterisk.'],
            ['file\\*.txt', 'fileX.txt', false, 'Escaped asterisk: should not match when a literal asterisk is expected.'],
            ['file\\{js,css\\}.txt', 'filejs.txt', false, 'Escaped braces: should not match when braces are missing.'],
        ];
    }

    /**
     * @dataProvider providerBraceExpansion
     */
    public function test_brace_expansion(string $pattern, array $expected, string $message): void
    {
        $expanded = $this->converter->expandBraces($pattern);
        sort($expanded);
        sort($expected);
        $this->assertEquals(
            $expected,
            $expanded,
            "Brace expansion for pattern [$pattern]: ".$message
        );
    }

    public function providerBraceExpansion(): array
    {
        return [
            [
                '*.{js,css,html}',
                ['*.js', '*.css', '*.html'],
                "Expected expansion of '*.{js,css,html}' to be ['*.js', '*.css', '*.html'].",
            ],
            [
                '{src,app}/{js,css}/*.{js,ts}',
                [
                    'src/js/*.js', 'src/js/*.ts',
                    'src/css/*.js', 'src/css/*.ts',
                    'app/js/*.js', 'app/js/*.ts',
                    'app/css/*.js', 'app/css/*.ts',
                ],
                "Expected nested expansion for '{src,app}/{js,css}/*.{js,ts}' to produce 8 combinations.",
            ],
        ];
    }
}
