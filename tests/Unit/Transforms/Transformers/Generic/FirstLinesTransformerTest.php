<?php

namespace Tests\Unit\Transforms\Transformers\Generic;

use App\Transforms\Transformers\Generic\FirstLinesTransformer;
use Symfony\Component\Finder\SplFileInfo;
use Tests\TestCase;

class FirstLinesTransformerTest extends TestCase
{
    private string $tempDir;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tempDir = sys_get_temp_dir().'/first_lines_transformer_test_'.uniqid();
        mkdir($this->tempDir, 0777, true);
    }

    protected function tearDown(): void
    {
        $this->removeDirectory($this->tempDir);
        parent::tearDown();
    }

    private function createTestFile(string $filename, string $content): SplFileInfo
    {
        $filePath = $this->tempDir.DIRECTORY_SEPARATOR.$filename;
        file_put_contents($filePath, $content);
        $relativePath = dirname($filename) === '.' ? '' : dirname($filename);
        $relativeName = $filename;

        return new SplFileInfo($filePath, $relativePath, $relativeName);
    }

    public function test_transform_returns_correct_number_of_lines()
    {
        $transformer = new FirstLinesTransformer;
        $content = implode("\n", array_fill(0, 30, 'This is line content.'));
        $file = $this->createTestFile('thirty_lines.txt', $content);

        $result = $transformer->transform($file);
        $this->assertCount(20, explode("\n", $result));
        $this->assertEquals(implode("\n", array_fill(0, 20, 'This is line content.')), $result);
    }

    public function test_transform_returns_all_lines_if_less_than_limit()
    {
        $transformer = new FirstLinesTransformer;
        $content = implode("\n", array_fill(0, 10, 'Short file line.'));
        $file = $this->createTestFile('ten_lines.txt', $content);

        $result = $transformer->transform($file);
        $this->assertCount(10, explode("\n", $result));
        $this->assertEquals($content, $result);
    }

    public function test_transform_handles_empty_file()
    {
        $transformer = new FirstLinesTransformer;
        $file = $this->createTestFile('empty_file.txt', '');

        $result = $transformer->transform($file);
        $this->assertEquals('', $result);
    }

    public function test_transform_handles_string_input()
    {
        $transformer = new FirstLinesTransformer;
        $content = implode("\n", array_fill(0, 30, 'Line from string.'));

        $result = $transformer->transform($content);
        $this->assertCount(20, explode("\n", $result));
        $this->assertEquals(implode("\n", array_slice(explode("\n", $content), 0, 20)), $result);
    }
}
