<?php

namespace App\Profiles;

use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\File;
use RuntimeException;
use Symfony\Component\Yaml\Exception\ParseException;
use Symfony\Component\Yaml\Yaml;

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
     * @param  string  $profilePath  The full path to the profile YAML file to load.
     * @param  array  $commandOptions  Additional options from the command to merge into the profile.
     *
     * @throws RuntimeException If the profile file does not exist, contains invalid YAML, or if a circular extension is detected.
     */
    public function load(?string $profilePath, array $commandOptions = []): void
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
     * @throws RuntimeException If a file is missing, YAML is invalid, or a circular dependency is detected.
     */
    private function loadProfileData(?string $profilePath, array &$loadedProfiles = []): array
    {
        if (is_null($profilePath)) {
            return [];
        }

        // Normalize the profile path using realpath.
        $realProfilePath = realpath($profilePath);
        if ($realProfilePath === false) {
            return [];
        }

        // Check for circular dependency using the normalized path.
        if (in_array($realProfilePath, $loadedProfiles)) {
            throw new RuntimeException('Circular profile extension detected: '.implode(' -> ', $loadedProfiles)." -> $realProfilePath");
        }
        $loadedProfiles[] = $realProfilePath;

        // Load and parse the YAML file.
        $yaml = File::get($realProfilePath);
        try {
            $data = Yaml::parse($yaml);
        } catch (ParseException $e) {
            throw new RuntimeException('Invalid YAML in profile configuration: '.$e->getMessage());
        }

        if (! is_array($data)) {
            throw new RuntimeException('The profile configuration must be an array.');
        }

        // Handle profile extension if specified.
        if (isset($data['extends'])) {
            $baseProfileName = $data['extends'];
            $guesser = new ProfileGuesser($this->projectPath);
            $baseProfilePath = $guesser->getProfilePath($baseProfileName);
            // Recursive call with the normalized $loadedProfiles.
            $baseData = $this->loadProfileData($baseProfilePath, $loadedProfiles);
            $data = $this->mergeProfiles($baseData, $data);
        }

        return $data;
    }

    /**
     * Merge the base profile data with the current profile data.
     *
     * For keys like "include", "exclude", "external", and "transforms", the arrays are concatenated
     * (with base entries coming first). In addition, the "always" key is merged separately as a list.
     *
     * @param  array  $baseData  The data from the base profile.
     * @param  array  $currentData  The data from the current profile.
     * @return array The merged profile data.
     */
    private function mergeProfiles(array $baseData, array $currentData): array
    {
        // Start with the current data to preserve any unique keys.
        $merged = $currentData;

        // Concatenate arrays for keys where order matters.
        $concatKeys = ['include', 'exclude', 'external', 'transforms'];
        foreach ($concatKeys as $key) {
            if (isset($baseData[$key])) {
                $merged[$key] = array_merge($baseData[$key], $merged[$key] ?? []);
            }
        }

        // Merge "always" as a separate list.
        if (isset($baseData['always']) || isset($currentData['always'])) {
            $merged['always'] = array_merge($baseData['always'] ?? [], $currentData['always'] ?? []);
        }

        // Remove the "extends" key from the final merged data.
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
