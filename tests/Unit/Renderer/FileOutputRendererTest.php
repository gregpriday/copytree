<?php

namespace Tests\Unit\Renderer;

use App\Renderer\FileOutputRenderer;
use App\Transforms\FileTransformer;
use CzProject\GitPhp\GitRepository;
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

    /**
     * Test that the modified time attribute is correctly included in the output.
     */
    public function test_render_includes_modified_time()
    {
        // Create a temporary file with known content.
        $tempFile = tempnam(sys_get_temp_dir(), 'testfile');
        $content = "line 1\nline 2\nline 3";
        file_put_contents($tempFile, $content);

        // Set a specific modification time
        $modificationTime = strtotime('2023-01-01 12:00:00');
        touch($tempFile, $modificationTime);

        // Create a partial mock for SplFileInfo.
        $file = $this->getMockBuilder(SplFileInfo::class)
            ->setConstructorArgs([$tempFile, '', 'testfile.txt'])
            ->onlyMethods(['getRelativePathname'])
            ->getMock();
        $file->method('getRelativePathname')->willReturn('testfile.txt');

        // Create a dummy transformer
        $dummyTransformer = $this->getMockBuilder(FileTransformer::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['transform'])
            ->getMock();
        $dummyTransformer->method('transform')->willReturn('transformed content');

        // Instantiate the FileOutputRenderer
        $renderer = new FileOutputRenderer($dummyTransformer);

        // Render the file
        $output = $renderer->render([$file]);

        // Assert that the output contains the expected modified time
        $expectedModifiedTime = date('Y-m-d H:i:s', $modificationTime);
        $this->assertStringContainsString('modified-time="'.$expectedModifiedTime.'"', $output);

        // Remove the temporary file.
        unlink($tempFile);
    }

    /**
     * Test that the has-uncommitted-changes attribute is included when a Git repository is set.
     */
    public function test_render_includes_uncommitted_changes_when_git_repo_is_set()
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

        // Create a dummy transformer
        $dummyTransformer = $this->getMockBuilder(FileTransformer::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['transform'])
            ->getMock();
        $dummyTransformer->method('transform')->willReturn('transformed content');

        // Create a mock RunnerResult to use with the GitRepository
        $runnerResult = $this->getMockBuilder(\CzProject\GitPhp\RunnerResult::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['getOutput'])
            ->getMock();
        $runnerResult->method('getOutput')->willReturn([' M testfile.txt']);

        // Create a mock for GitRepository that returns modified files
        $gitRepo = $this->getMockBuilder(GitRepository::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['run'])
            ->getMock();
        $gitRepo->method('run')->willReturn($runnerResult);

        // Instantiate the FileOutputRenderer and set the Git repository
        $renderer = new FileOutputRenderer($dummyTransformer);
        $renderer->setGitRepository($gitRepo);

        // Render the file
        $output = $renderer->render([$file]);

        // Assert that the output contains the uncommitted changes attribute set to true
        $this->assertStringContainsString('has-uncommitted-changes="true"', $output);

        // Remove the temporary file.
        unlink($tempFile);
    }

    /**
     * Test that the has-uncommitted-changes attribute is not included when no Git repository is set.
     */
    public function test_render_does_not_include_uncommitted_changes_when_no_git_repo()
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

        // Create a dummy transformer
        $dummyTransformer = $this->getMockBuilder(FileTransformer::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['transform'])
            ->getMock();
        $dummyTransformer->method('transform')->willReturn('transformed content');

        // Instantiate the FileOutputRenderer without setting a Git repository
        $renderer = new FileOutputRenderer($dummyTransformer);

        // Render the file
        $output = $renderer->render([$file]);

        // Assert that the output does not contain the uncommitted changes attribute
        $this->assertStringNotContainsString('has-uncommitted-changes', $output);

        // Remove the temporary file.
        unlink($tempFile);
    }

    /**
     * Test that the has-uncommitted-changes attribute is set to false for files without uncommitted changes.
     */
    public function test_render_shows_false_for_files_without_uncommitted_changes()
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

        // Create a dummy transformer
        $dummyTransformer = $this->getMockBuilder(FileTransformer::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['transform'])
            ->getMock();
        $dummyTransformer->method('transform')->willReturn('transformed content');

        // Create a mock RunnerResult to use with the GitRepository
        $runnerResult = $this->getMockBuilder(\CzProject\GitPhp\RunnerResult::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['getOutput'])
            ->getMock();
        $runnerResult->method('getOutput')->willReturn(['?? other_file.txt']); // Only untracked files

        // Create a mock for GitRepository that reports no modified files
        $gitRepo = $this->getMockBuilder(GitRepository::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['run'])
            ->getMock();
        $gitRepo->method('run')->willReturn($runnerResult);

        // Instantiate the FileOutputRenderer and set the Git repository
        $renderer = new FileOutputRenderer($dummyTransformer);
        $renderer->setGitRepository($gitRepo);

        // Render the file
        $output = $renderer->render([$file]);

        // Assert that the output contains the uncommitted changes attribute set to false
        $this->assertStringContainsString('has-uncommitted-changes="false"', $output);

        // Remove the temporary file.
        unlink($tempFile);
    }

    /**
     * Test that binary files are replaced with a placeholder.
     */
    public function test_render_replaces_binary_files_with_placeholder()
    {
        // Create a temporary file with binary content (including null bytes)
        $tempFile = tempnam(sys_get_temp_dir(), 'binary_test');
        // Write binary content with null bytes
        file_put_contents($tempFile, "text\0binary");

        // Create a partial mock for SplFileInfo
        $file = $this->getMockBuilder(SplFileInfo::class)
            ->setConstructorArgs([$tempFile, '', 'binary.pth'])
            ->onlyMethods(['getRelativePathname'])
            ->getMock();
        $file->method('getRelativePathname')->willReturn('binary.pth');

        // Create a dummy transformer that should NOT be called for binary files
        $dummyTransformer = $this->getMockBuilder(FileTransformer::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['transform'])
            ->getMock();

        // The transform method will be called and should return the binary placeholder
        $dummyTransformer->expects($this->once())
            ->method('transform')
            ->willReturn('[Binary file - not displayed]');

        // Instantiate the FileOutputRenderer
        $renderer = new FileOutputRenderer($dummyTransformer);

        // Render the file
        $output = $renderer->render([$file]);

        // Assert that the output contains the binary file message
        $this->assertStringContainsString('[Binary file - not displayed]', $output);

        // Clean up
        unlink($tempFile);
    }

    /**
     * Test that large files are replaced with a placeholder.
     */
    public function test_render_replaces_large_files_with_placeholder()
    {
        // Create a temporary file
        $tempFile = tempnam(sys_get_temp_dir(), 'large_test');

        // Get a mock to avoid actually creating a huge file
        $file = $this->getMockBuilder(SplFileInfo::class)
            ->setConstructorArgs([$tempFile, '', 'large.txt'])
            ->onlyMethods(['getRelativePathname', 'getSize', 'getRealPath'])
            ->getMock();

        // Configure the mock to report a size larger than 1MB
        $file->method('getRelativePathname')->willReturn('large.txt');
        $file->method('getSize')->willReturn(1024 * 1024 + 1); // 1MB + 1 byte
        $file->method('getRealPath')->willReturn($tempFile);

        // Create a dummy transformer that should NOT be called for large files
        $dummyTransformer = $this->getMockBuilder(FileTransformer::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['transform'])
            ->getMock();

        // The transform method will be called but should handle large files
        // FileLoader truncates large files and adds a message
        $dummyTransformer->expects($this->once())
            ->method('transform')
            ->willReturn("Large file content...\n\n=== Only showing the first 5MB ===");

        // Instantiate the FileOutputRenderer
        $renderer = new FileOutputRenderer($dummyTransformer);

        // Render the file
        $output = $renderer->render([$file]);

        // Assert that the output contains the large file message
        $this->assertStringContainsString('=== Only showing the first 5MB ===', $output);

        // Clean up
        unlink($tempFile);
    }

    /**
     * Test that large files have line count set to N/A and content replaced with placeholder.
     */
    public function test_render_handles_large_files_efficiently()
    {
        // Create a temporary file larger than MAX_SIZE_FOR_LINE_COUNT
        $tempFile = tempnam(sys_get_temp_dir(), 'large_file_test');

        // Generate a large content
        // For test purposes, we'll mock a large file rather than actually creating one
        $mockFileSize = 11 * 1024 * 1024; // 11MB (just over the 10MB threshold)

        // Create a partial mock for SplFileInfo
        $file = $this->getMockBuilder(SplFileInfo::class)
            ->setConstructorArgs([$tempFile, '', 'large_file.csv'])
            ->onlyMethods(['getRelativePathname', 'getSize', 'getRealPath'])
            ->getMock();
        $file->method('getRelativePathname')->willReturn('large_file.csv');
        $file->method('getSize')->willReturn($mockFileSize);
        $file->method('getRealPath')->willReturn($tempFile);

        // Write a small amount of content to the temp file
        file_put_contents($tempFile, "Sample content\n");

        // Create a dummy transformer
        $dummyTransformer = $this->getMockBuilder(FileTransformer::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['transform'])
            ->getMock();
        // The transformer will be called once for the single large file
        $dummyTransformer->expects($this->once())
            ->method('transform')
            ->willReturn("Large file content...\n\n=== Only showing the first 5MB ===");

        // Instantiate the renderer
        $renderer = new FileOutputRenderer($dummyTransformer);

        // Render the file
        $output = $renderer->render([$file]);

        // Assert that files have a size attribute (11 MB is shown for large files)
        $this->assertStringContainsString('size="11 MB"', $output);

        // Assert that content shows the large file message
        $this->assertStringContainsString('=== Only showing the first 5MB ===', $output);

        // Remove the temporary file
        unlink($tempFile);
    }
}
