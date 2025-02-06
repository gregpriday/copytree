<?php

namespace Tests\Unit\Renderer;

use App\Renderer\FileOutputRenderer;
use App\Transforms\FileTransformer;
use Symfony\Component\Finder\SplFileInfo;
use Tests\TestCase;

class FileOutputRendererTest extends TestCase
{
    /**
     * Test that a single file is rendered correctly without line truncation.
     */
    public function test_render_single_file_without_max_lines()
    {
        // Create a temporary file with known content.
        $tempFile = tempnam(sys_get_temp_dir(), 'testfile');
        $content = "line 1\nline 2\nline 3";
        file_put_contents($tempFile, $content);

        // Create a partial mock for SplFileInfo.
        $file = $this->getMockBuilder(SplFileInfo::class)
            ->setConstructorArgs([$tempFile, '', 'testfile.txt'])
            ->onlyMethods(['getRelativePathname'])
            ->getMock();
        $file->method('getRelativePathname')->willReturn('testfile.txt');

        // Create a dummy transformer that always returns a known string.
        $dummyTransformer = $this->getMockBuilder(FileTransformer::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['transform'])
            ->getMock();
        $dummyTransformer->method('transform')->willReturn('transformed content');

        // Instantiate the FileOutputRenderer with the dummy transformer.
        $renderer = new FileOutputRenderer($dummyTransformer);

        // Render with no maximum lines (0 means unlimited).
        $output = $renderer->render([$file], 0);

        // Assert that the output contains the expected XML metadata and transformed content.
        $this->assertStringContainsString('<ct:file_contents path="testfile.txt"', $output);
        $this->assertStringContainsString('mime-type="text/plain"', $output);
        $this->assertStringContainsString('lines="3"', $output);
        $this->assertStringContainsString('transformed content', $output);
        $this->assertStringContainsString('</ct:file_contents> <!-- End of file: testfile.txt -->', $output);

        // Remove the temporary file.
        unlink($tempFile);
    }

    /**
     * Test that file content is truncated correctly when a maximum number of lines is set.
     */
    public function test_render_file_with_max_lines_truncation()
    {
        // Create a temporary file with content that has four lines.
        $tempFile = tempnam(sys_get_temp_dir(), 'testfile');
        $content = "line1\nline2\nline3\nline4";
        file_put_contents($tempFile, $content);

        // Create a partial mock for SplFileInfo with the three required constructor arguments.
        $file = $this->getMockBuilder(SplFileInfo::class)
            ->setConstructorArgs([$tempFile, '', 'testfile.txt'])
            ->onlyMethods(['getRelativePathname'])
            ->getMock();
        $file->method('getRelativePathname')->willReturn('testfile.txt');

        // Create a dummy transformer that returns the file content.
        $dummyTransformer = $this->getMockBuilder(FileTransformer::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['transform'])
            ->getMock();
        $dummyTransformer->method('transform')->willReturn($content);

        // Instantiate the renderer.
        $renderer = new FileOutputRenderer($dummyTransformer);

        // Specify that only 2 lines should be shown.
        $maxLines = 2;
        $output = $renderer->render([$file], $maxLines);

        // The expected truncated content should show the first 2 lines followed by the truncation notice.
        $expectedTruncatedContent = "line1\nline2\n\n... [truncated after {$maxLines} lines] ...";
        $this->assertStringContainsString($expectedTruncatedContent, $output);

        // Clean up the temporary file.
        unlink($tempFile);
    }
}
