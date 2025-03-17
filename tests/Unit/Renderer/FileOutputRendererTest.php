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
        $this->assertStringContainsString('modified-time="' . $expectedModifiedTime . '"', $output);
        
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
}
