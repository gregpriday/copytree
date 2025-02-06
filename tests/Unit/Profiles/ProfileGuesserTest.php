<?php

namespace Tests\Unit\Profiles;

use App\Profiles\ProfileGuesser;
use PHPUnit\Framework\TestCase;

class ProfileGuesserTest extends TestCase
{
    /**
     * Create a temporary directory for testing.
     */
    private function createTempDir(): string
    {
        $tempDir = sys_get_temp_dir().'/profile_guesser_test_'.uniqid();
        if (! mkdir($tempDir, 0777, true) && ! is_dir($tempDir)) {
            throw new \RuntimeException(sprintf('Directory "%s" was not created', $tempDir));
        }

        return $tempDir;
    }

    /**
     * Recursively remove a directory.
     */
    private function deleteDir(string $dir): void
    {
        if (! is_dir($dir)) {
            return;
        }
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($iterator as $item) {
            if ($item->isDir()) {
                rmdir($item->getRealPath());
            } else {
                unlink($item->getRealPath());
            }
        }
        rmdir($dir);
    }

    /**
     * Test that if .ctree/profile.json exists, guess() returns "profile".
     */
    public function test_guess_returns_profile_when_profile_json_exists(): void
    {
        $tempDir = $this->createTempDir();
        $ctreeDir = $tempDir.DIRECTORY_SEPARATOR.'.ctree';
        mkdir($ctreeDir, 0777, true);
        // Create a dummy profile.json file.
        file_put_contents($ctreeDir.DIRECTORY_SEPARATOR.'profile.json', '{}');

        $guesser = new ProfileGuesser($tempDir);
        $this->assertEquals('profile', $guesser->guess(), 'Expected "profile" when .ctree/profile.json exists.');

        $this->deleteDir($tempDir);
    }

    /**
     * Test that if .ctree/ruleset.json exists (and no profile.json), guess() returns "ruleset".
     */
    public function test_guess_returns_ruleset_when_ruleset_json_exists(): void
    {
        $tempDir = $this->createTempDir();
        $ctreeDir = $tempDir.DIRECTORY_SEPARATOR.'.ctree';
        mkdir($ctreeDir, 0777, true);
        // Create a dummy ruleset.json file.
        file_put_contents($ctreeDir.DIRECTORY_SEPARATOR.'ruleset.json', '{}');

        $guesser = new ProfileGuesser($tempDir);
        $this->assertEquals('ruleset', $guesser->guess(), 'Expected "ruleset" when .ctree/ruleset.json exists and no profile.json.');

        $this->deleteDir($tempDir);
    }

    /**
     * Test that a Laravel project structure causes guess() to return "laravel".
     */
    public function test_guess_returns_laravel_when_laravel_project(): void
    {
        $tempDir = $this->createTempDir();

        // Simulate a Laravel project by creating an 'artisan' file and required directories.
        file_put_contents($tempDir.DIRECTORY_SEPARATOR.'artisan', '');
        mkdir($tempDir.DIRECTORY_SEPARATOR.'app', 0777, true);
        mkdir($tempDir.DIRECTORY_SEPARATOR.'bootstrap', 0777, true);
        mkdir($tempDir.DIRECTORY_SEPARATOR.'config', 0777, true);
        mkdir($tempDir.DIRECTORY_SEPARATOR.'database', 0777, true);

        $guesser = new ProfileGuesser($tempDir);
        $this->assertEquals('laravel', $guesser->guess(), 'Expected "laravel" when Laravel project structure is detected.');

        $this->deleteDir($tempDir);
    }

    /**
     * Test that a SvelteKit project is detected via package.json and returns "sveltekit".
     */
    public function test_guess_returns_sveltekit_when_sveltekit_project(): void
    {
        $tempDir = $this->createTempDir();

        // Create a package.json with @sveltejs/kit in dependencies.
        $packageJsonContent = json_encode([
            'dependencies' => [
                '@sveltejs/kit' => 'latest',
            ],
        ]);
        file_put_contents($tempDir.DIRECTORY_SEPARATOR.'package.json', $packageJsonContent);

        $guesser = new ProfileGuesser($tempDir);
        $this->assertEquals('sveltekit', $guesser->guess(), 'Expected "sveltekit" when package.json contains @sveltejs/kit.');

        $this->deleteDir($tempDir);
    }

    /**
     * Test that if no specific indicators are found, guess() returns "default".
     */
    public function test_guess_returns_default_when_no_indicators(): void
    {
        $tempDir = $this->createTempDir();

        // Do not create any special files or directories.
        $guesser = new ProfileGuesser($tempDir);
        $this->assertEquals('default', $guesser->guess(), 'Expected "default" when no profile indicators are present.');

        $this->deleteDir($tempDir);
    }
}
