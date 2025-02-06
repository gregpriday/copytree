<?php

namespace Tests\Unit\Pipeline\Stages;

use App\Pipeline\RulesetFilter;
use App\Pipeline\Stages\RulesetFilterStage;
use Symfony\Component\Finder\SplFileInfo;
use Tests\TestCase;

class RulesetFilterStageTest extends TestCase
{
    protected string $tempDir;

    protected function setUp(): void
    {
        $this->tempDir = sys_get_temp_dir().'/ruleset_filter_stage_test_'.uniqid();
        mkdir($this->tempDir, 0777, true);
    }

    protected function tearDown(): void
    {
        $this->removeDirectory($this->tempDir);
    }

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

    /**
     * Helper to create a test file and return a SplFileInfo instance.
     */
    protected function createTestFile(string $relativePath, string $content): SplFileInfo
    {
        $fullPath = $this->tempDir.'/'.$relativePath;
        $dir = dirname($fullPath);
        if (! is_dir($dir)) {
            mkdir($dir, 0777, true);
        }
        file_put_contents($fullPath, $content);

        return new SplFileInfo($fullPath, dirname($relativePath), $relativePath);
    }

    public function test_ruleset_filter_stage_filters_files()
    {
        // Define a ruleset that accepts only files with extension "php".
        $rules = [
            [
                ['extension', '=', 'php'],
            ],
        ];
        $rulesetFilter = new RulesetFilter($rules);
        $stage = new RulesetFilterStage($rulesetFilter);

        $filePhp = $this->createTestFile('src/code.php', 'php code');
        $fileTxt = $this->createTestFile('docs/readme.txt', 'text content');

        // Provide files as raw SplFileInfo objects.
        $files = [$filePhp, $fileTxt];

        $next = function ($files) {
            return $files;
        };

        $result = $stage->handle($files, $next);

        // Expect only the PHP file to pass through.
        $this->assertCount(1, $result);
        $this->assertEquals('src/code.php', $result[0]->getRelativePathname());
    }
}
