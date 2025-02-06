<?php

namespace Tests\Integration;

use App\Exceptions\InvalidGitHubUrlException;
use App\Services\GitHubUrlHandler;
use ReflectionClass;
use Tests\TestCase;

class GitHubUrlHandlerTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        // This integration test is only for macOS.
        if (PHP_OS_FAMILY !== 'Darwin') {
            $this->markTestSkipped('GitHubUrlHandler integration tests only run on macOS.');
        }
    }

    /**
     * Test that a valid GitHub URL clones the repository and returns a directory that contains a README.
     */
    public function test_clone_repository(): void
    {
        // Use a known public repository with an explicit branch.
        $url = 'https://github.com/octocat/Hello-World/tree/master';
        $handler = new GitHubUrlHandler($url);

        // Get the local repository path.
        $repoPath = $handler->getFiles();
        $this->assertDirectoryExists($repoPath, 'The repository directory should exist after cloning.');

        // Look for a README file (either "README" or "README.md").
        $readmePath = $repoPath.DIRECTORY_SEPARATOR.'README';
        if (! file_exists($readmePath)) {
            $readmePath = $repoPath.DIRECTORY_SEPARATOR.'README.md';
        }
        $this->assertFileExists($readmePath, 'The repository should contain a README file.');

        // Clean up: call cleanup() to remove the cloned repository.
        $handler->cleanup();

        // Use reflection to access the protected repoDir property.
        $reflection = new ReflectionClass($handler);
        $prop = $reflection->getProperty('repoDir');
        $prop->setAccessible(true);
        $repoDir = $prop->getValue($handler);

        $this->assertDirectoryDoesNotExist($repoDir, 'The repository cache should be removed after cleanup.');
    }

    /**
     * Test that constructing GitHubUrlHandler with an invalid URL format throws an exception.
     */
    public function test_invalid_git_hub_url_format(): void
    {
        $this->expectException(InvalidGitHubUrlException::class);
        $invalidUrl = 'https://example.com/invalid/repo';
        new GitHubUrlHandler($invalidUrl);
    }

    /**
     * Test that specifying a non-existent subpath causes an exception.
     */
    public function test_sub_path_not_found(): void
    {
        $this->expectException(InvalidGitHubUrlException::class);
        // Append a subpath that does not exist.
        $url = 'https://github.com/octocat/Hello-World/tree/master/nonexistent';
        $handler = new GitHubUrlHandler($url);
        $handler->getFiles();
    }
}
