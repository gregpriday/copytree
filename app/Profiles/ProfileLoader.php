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
 * If the profile specifies an "extends" key, it will inherit settings from the named base profile,
 * merging them with its own settings. This service also merges any additional command options
 * (if provided) with the profile data and sets the resulting array into the config under the "profile" key.
 */
class ProfileLoader
{
    /** @var string The project path used to resolve base profile paths */
    private string $projectPath;

    /**
     * ProfileLoader constructor.
     *
     * @param  string  $projectPath  The base path of the project, used to resolve extended profile paths.
     */
    public function __construct(string $projectPath)
    {
        $this->projectPath = $projectPath;
    }

    /**
     * Load the profile configuration from the file and merge in any command options.
     *
     * After calling this method, the profile configuration will be available via config('profile').
     *
     * @param  string  $profilePath  The full path to the profile JSON file to load.
     * @param  array  $commandOptions  Additional options from the command to merge into the profile.
     *
     * @throws RuntimeException If the profile file does not exist, contains invalid JSON, or if a circular extension is detected.
     */
    public function load(string $profilePath, array $commandOptions = []): void
    {
        $profileData = $this->loadProfileData($profilePath);
        $profileData = array_merge($profileData, $commandOptions);
        Config::set('profile', $profileData);
    }

    /**
     * Recursively load profile data, handling extensions by merging with base profiles.
     *
     * @param  string  $profilePath  The path to the profile file to load.
     * @param  array  $loadedProfiles  Array of profile paths already loaded in this chain, to detect circular dependencies.
     * @return array The loaded and potentially merged profile data.
     *
     * @throws RuntimeException If a file is missing, JSON is invalid, or a circular dependency is detected.
     */
    private function loadProfileData(string $profilePath, array &$loadedProfiles = []): array
    {
        // Normalize the profile path using realpath
        $realProfilePath = realpath($profilePath);
        if ($realProfilePath === false) {
            throw new RuntimeException("Profile file not found: $profilePath");
        }

        // Check for circular dependency using the normalized path
        if (in_array($realProfilePath, $loadedProfiles)) {
            throw new RuntimeException('Circular profile extension detected: '.implode(' -> ', $loadedProfiles)." -> $realProfilePath");
        }
        $loadedProfiles[] = $realProfilePath;

        // Load the JSON using the normalized path
        $json = File::get($realProfilePath);
        $data = json_decode($json, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new RuntimeException('Invalid JSON in profile configuration: '.json_last_error_msg());
        }

        // Handle extension
        if (isset($data['extends'])) {
            $baseProfileName = $data['extends'];
            $guesser = new ProfileGuesser($this->projectPath);
            $baseProfilePath = $guesser->getProfilePath($baseProfileName);
            // Recursive call with the normalized $loadedProfiles
            $baseData = $this->loadProfileData($baseProfilePath, $loadedProfiles);
            $data = $this->mergeProfiles($baseData, $data);
        }

        return $data;
    }

    /**
     * Merge the base profile data with the current profile data.
     *
     * Arrays in "rules", "globalExcludeRules", "external", and "transforms" are concatenated (base first, then current).
     * Arrays in "always.include" and "always.exclude" are concatenated and duplicates removed.
     * Other keys from the current profile are preserved as-is.
     *
     * @param  array  $baseData  The data from the base profile.
     * @param  array  $currentData  The data from the current profile.
     * @return array The merged profile data.
     */
    private function mergeProfiles(array $baseData, array $currentData): array
    {
        // Start with the current data to preserve any unique keys
        $merged = $currentData;

        // Concatenate arrays where order matters (base entries first)
        $concatKeys = ['rules', 'globalExcludeRules', 'external', 'transforms'];
        foreach ($concatKeys as $key) {
            if (isset($baseData[$key])) {
                $merged[$key] = array_merge($baseData[$key], $merged[$key] ?? []);
            }
        }

        // Merge the "always" section
        if (isset($baseData['always'])) {
            $merged['always']['include'] = array_unique(
                array_merge($baseData['always']['include'] ?? [], $merged['always']['include'] ?? [])
            );
            $merged['always']['exclude'] = array_unique(
                array_merge($baseData['always']['exclude'] ?? [], $merged['always']['exclude'] ?? [])
            );
        } else {
            // Ensure "always" is present, even if empty
            $merged['always'] = $merged['always'] ?? ['include' => [], 'exclude' => []];
        }

        // Remove the "extends" key from the final data
        unset($merged['extends']);

        return $merged;
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
