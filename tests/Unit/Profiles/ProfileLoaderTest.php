<?php

namespace Tests\Unit\Profiles;

use App\Profiles\ProfileGuesser;
use App\Profiles\ProfileLoader;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\File;
use RuntimeException;
use Tests\TestCase;

class ProfileLoaderTest extends TestCase
{
    protected string $tempDir;

    protected string $ctreeDir;

    protected string $baseProfilePath;

    protected string $extendedProfilePath;

    /**
     * Set up the test environment.
     */
    protected function setUp(): void
    {
        parent::setUp();

        // Create a temporary project directory
        $this->tempDir = sys_get_temp_dir().'/profile_loader_test_'.uniqid();
        mkdir($this->tempDir, 0777, true);

        // Create the .ctree directory for profiles
        $this->ctreeDir = $this->tempDir.'/.ctree';
        mkdir($this->ctreeDir, 0777, true);

        // Define paths for base and extended profiles
        $this->baseProfilePath = $this->ctreeDir.'/base.json';
        $this->extendedProfilePath = $this->ctreeDir.'/extended.json';
    }

    /**
     * Clean up the test environment.
     */
    protected function tearDown(): void
    {
        $this->removeDirectory($this->tempDir);
        parent::tearDown();
    }

    /**
     * Test loading a valid profile without inheritance.
     */
    public function test_load_valid_profile_without_extension()
    {
        // Create a valid profile JSON file without extension
        $profileData = [
            'rules' => [[['extension', '=', 'php']]],
            'globalExcludeRules' => [],
        ];
        File::put($this->extendedProfilePath, json_encode($profileData));

        $loader = new ProfileLoader($this->tempDir);
        $loader->load($this->extendedProfilePath);

        $this->assertEquals($profileData, Config::get('profile'));
    }

    /**
     * Test loading a profile that extends another profile.
     */
    public function test_load_profile_with_extension()
    {
        // Create a base profile
        $baseData = [
            'rules' => [[['folder', 'startsWith', 'src']]],
            'globalExcludeRules' => [[['basename', 'startsWith', '.']]],
            'always' => [
                'include' => ['README.md'],
                'exclude' => ['.env'],
            ],
        ];
        File::put($this->baseProfilePath, json_encode($baseData));

        // Create an extending profile
        $extendedData = [
            'extends' => 'base',
            'rules' => [[['extension', '=', 'js']]],
            'always' => [
                'include' => ['package.json'],
            ],
        ];
        File::put($this->extendedProfilePath, json_encode($extendedData));

        // Normalize the base profile path using realpath
        $baseRealPath = realpath($this->baseProfilePath);

        // Mock ProfileGuesser to return the normalized base profile path
        $guesserMock = \Mockery::mock(\App\Profiles\ProfileGuesser::class);
        $guesserMock->shouldReceive('getProfilePath')
            ->with('base')
            ->andReturn($baseRealPath);
        $this->app->instance(\App\Profiles\ProfileGuesser::class, $guesserMock);

        $loader = new \App\Profiles\ProfileLoader($this->tempDir);
        $loader->load($this->extendedProfilePath);

        $expected = [
            'rules' => [
                [['folder', 'startsWith', 'src']],
                [['extension', '=', 'js']],
            ],
            'globalExcludeRules' => [[['basename', 'startsWith', '.']]],
            'always' => [
                'include' => ['README.md', 'package.json'],
                'exclude' => ['.env'],
            ],
        ];
        $this->assertEquals($expected, Config::get('profile'));
    }

    /**
     * Test detection of circular profile dependencies.
     */
    public function test_load_profile_with_circular_dependency()
    {
        // Create two profiles that extend each other
        $profileAData = ['extends' => 'profileB'];
        $profileBData = ['extends' => 'profileA'];
        $profileAPath = $this->ctreeDir.'/profileA.json';
        $profileBPath = $this->ctreeDir.'/profileB.json';
        File::put($profileAPath, json_encode($profileAData));
        File::put($profileBPath, json_encode($profileBData));

        // Use realpath() to obtain the normalized paths
        $profileARealPath = realpath($profileAPath);
        $profileBRealPath = realpath($profileBPath);

        // Mock ProfileGuesser to return the respective real paths
        $guesserMock = \Mockery::mock(\App\Profiles\ProfileGuesser::class);
        $guesserMock->shouldReceive('getProfilePath')
            ->with('profileB')
            ->andReturn($profileBRealPath);
        $guesserMock->shouldReceive('getProfilePath')
            ->with('profileA')
            ->andReturn($profileARealPath);
        $this->app->instance(\App\Profiles\ProfileGuesser::class, $guesserMock);

        $loader = new \App\Profiles\ProfileLoader($this->tempDir);

        $expectedMessage = "Circular profile extension detected: $profileARealPath -> $profileBRealPath -> $profileARealPath";
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage($expectedMessage);
        $loader->load($profileAPath);
    }

    /**
     * Test loading a non-existent profile.
     */
    public function test_load_nonexistent_profile()
    {
        $loader = new ProfileLoader($this->tempDir);
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage("Profile file not found: {$this->tempDir}/nonexistent.json");
        $loader->load($this->tempDir.'/nonexistent.json');
    }

    /**
     * Test loading a profile with invalid JSON.
     */
    public function test_load_invalid_json()
    {
        // Create a file with invalid JSON
        File::put($this->extendedProfilePath, 'invalid json');

        $loader = new ProfileLoader($this->tempDir);
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Invalid JSON in profile configuration:');
        $loader->load($this->extendedProfilePath);
    }

    /**
     * Test loading a profile with command options.
     */
    public function test_load_merges_command_options()
    {
        // Create a valid profile JSON file
        $profileData = [
            'rules' => [[['extension', '=', 'php']]],
            'globalExcludeRules' => [],
        ];
        File::put($this->extendedProfilePath, json_encode($profileData));

        $commandOptions = [
            'filter' => ['*.js'],
            'depth' => 5,
        ];

        $loader = new ProfileLoader($this->tempDir);
        $loader->load($this->extendedProfilePath, $commandOptions);

        $expected = array_merge($profileData, $commandOptions);
        $this->assertEquals($expected, Config::get('profile'));
    }

    /**
     * Test retrieving an empty profile when none is loaded.
     */
    public function test_get_profile_returns_empty_array_if_not_loaded()
    {
        $loader = new ProfileLoader($this->tempDir);
        $this->assertEquals([], $loader->getProfile());
    }

    /**
     * Test retrieving a loaded profile.
     */
    public function test_get_profile_returns_loaded_profile()
    {
        // Create a valid profile JSON file
        $profileData = ['rules' => [[['extension', '=', 'php']]]];
        File::put($this->extendedProfilePath, json_encode($profileData));

        $loader = new ProfileLoader($this->tempDir);
        $loader->load($this->extendedProfilePath);

        $this->assertEquals($profileData, $loader->getProfile());
    }

    /**
     * Recursively remove a directory and its contents.
     */
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
}
