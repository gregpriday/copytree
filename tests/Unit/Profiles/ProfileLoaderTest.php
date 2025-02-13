<?php

namespace Tests\Unit\Profiles;

use App\Profiles\ProfileLoader;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\File;
use RuntimeException;
use Tests\TestCase;

class ProfileLoaderTest extends TestCase
{
    protected string $tempDir;
    protected string $profilePath;

    protected function setUp(): void
    {
        parent::setUp();

        // Create a temporary directory for the test profile.
        $this->tempDir = sys_get_temp_dir().'/profile_loader_test_'.uniqid();
        mkdir($this->tempDir, 0777, true);
        $this->profilePath = $this->tempDir.'/test_profile.json';
    }

    protected function tearDown(): void
    {
        $this->removeDirectory($this->tempDir);
        parent::tearDown();
    }

    public function test_load_valid_profile()
    {
        // Create a valid profile JSON file.
        $profileData = [
            'rules' => [
                [['extension', '=', 'php']],
            ],
            'globalExcludeRules' => [],
        ];
        File::put($this->profilePath, json_encode($profileData));

        $loader = new ProfileLoader();
        $loader->load($this->profilePath);

        // Assert that the profile data is loaded into the config.
        $this->assertEquals($profileData, Config::get('profile'));
    }

    public function test_load_nonexistent_profile()
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage("Profile configuration not found at {$this->tempDir}/nonexistent.json");

        $loader = new ProfileLoader();
        $loader->load($this->tempDir.'/nonexistent.json');
    }

    public function test_load_invalid_json()
    {
        // Create a file with invalid JSON.
        File::put($this->profilePath, 'invalid json');

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Invalid JSON in profile configuration:');

        $loader = new ProfileLoader();
        $loader->load($this->profilePath);
    }

    public function test_load_merges_command_options()
    {
        // Create a valid profile JSON file.
        $profileData = [
            'rules' => [
                [['extension', '=', 'php']],
            ],
            'globalExcludeRules' => [],
        ];
        File::put($this->profilePath, json_encode($profileData));

        $commandOptions = [
            'filter' => ['*.js'],
            'depth' => 5,
        ];

        $loader = new ProfileLoader();
        $loader->load($this->profilePath, $commandOptions);

        // Assert that command options are merged and override profile settings.
        $expected = array_merge($profileData, $commandOptions);
        $this->assertEquals($expected, Config::get('profile'));
    }

    public function test_getProfile_returns_empty_array_if_not_loaded()
    {
        $loader = new ProfileLoader();
        $this->assertEquals([], $loader->getProfile());
    }

    public function test_getProfile_returns_loaded_profile()
    {
        // Create a valid profile JSON file
        $profileData = ['rules' => [[['extension', '=', 'php']]]];
        File::put($this->profilePath, json_encode($profileData));

        $loader = new ProfileLoader();
        $loader->load($this->profilePath);

        $this->assertEquals($profileData, $loader->getProfile());
    }
}
