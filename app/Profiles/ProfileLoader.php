<?php

namespace App\Profiles;

use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\File;
use RuntimeException;

/**
 * Class ProfileLoader
 *
 * Loads profile configuration from a JSON file (the "profile") into the Laravel Zero config.
 *
 * The profile configuration file is expected to contain keys such as "rules", "external", etc.
 * This service merges any additional command options (if provided) with the profile data and sets
 * the resulting array into the config under the "profile" key.
 */
class ProfileLoader
{
    /**
     * Load the profile configuration from the file and merge in any command options.
     *
     * After calling this method, the profile configuration will be available via config('profile').
     *
     * @throws RuntimeException If the profile file does not exist or contains invalid JSON.
     */
    public function load(string $profilePath, array $commandOptions = []): void
    {
        if (! File::exists($profilePath)) {
            throw new RuntimeException("Profile configuration not found at {$profilePath}");
        }

        $json = File::get($profilePath);
        $data = json_decode($json, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new RuntimeException('Invalid JSON in profile configuration: '.json_last_error_msg());
        }

        // Merge any command options with the profile data.
        // Command options can override the profile values.
        $profileData = array_merge($data, $commandOptions);

        // Save the profile configuration into the Laravel config repository.
        Config::set('profile', $profileData);
    }

    /**
     * Retrieve the loaded profile configuration.
     *
     * @return array The profile configuration array.
     */
    public function getProfile(): array
    {
        return Config::get('profile', []);
    }
}
