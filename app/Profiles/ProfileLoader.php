<?php

namespace App\Profiles;

use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
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
        try {
            $profileData = $this->loadProfileData($profilePath);
            $profileData = array_merge($profileData, $commandOptions);
            Config::set('profile', $profileData);
        } catch (RuntimeException $e) {
            Log::error('Error loading profile', [
                'profilePath' => $profilePath,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }

    /**
     * Recursively load profile data, handling extensions by merging with base profiles.
     *
     * @param  string|null  $profilePath  The path to the profile file to load.
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

        // Get profile name from path for more informative error messages
        $profileName = basename($profilePath);

        // Normalize the profile path using realpath.
        $realProfilePath = realpath($profilePath);
        if ($realProfilePath === false) {
            $searched = [
                $profilePath,
                $this->projectPath.'/.ctree/'.$profileName,
                copytree_path('profiles').'/'.$profileName,
            ];

            Log::warning('Profile file not found', [
                'profilePath' => $profilePath,
                'searchedLocations' => $searched,
            ]);

            throw new RuntimeException(
                "Profile file '{$profileName}' not found. Searched in: ".implode(', ', $searched)
            );
        }

        // Check for circular dependency using the normalized path.
        if (in_array($realProfilePath, $loadedProfiles)) {
            $chain = implode(' -> ', $loadedProfiles).' -> '.$realProfilePath;

            Log::error('Circular profile extension detected', [
                'profileChain' => $chain,
                'currentProfile' => $realProfilePath,
            ]);

            throw new RuntimeException("Circular profile extension detected in chain: {$chain}");
        }

        $loadedProfiles[] = $realProfilePath;

        // Load and parse the YAML file.
        try {
            $yaml = File::get($realProfilePath);
        } catch (\Exception $e) {
            Log::error('Error reading profile file', [
                'profilePath' => $realProfilePath,
                'error' => $e->getMessage(),
            ]);

            throw new RuntimeException("Could not read profile file '{$profileName}': ".$e->getMessage());
        }

        try {
            $data = Yaml::parse($yaml);
        } catch (ParseException $e) {
            $errorDetails = $e->getMessage();
            $lineNumber = preg_match('/at line (\d+)/', $errorDetails, $matches) ? $matches[1] : 'unknown';

            Log::error('Invalid YAML in profile', [
                'profilePath' => $realProfilePath,
                'line' => $lineNumber,
                'error' => $errorDetails,
            ]);

            throw new RuntimeException("Invalid YAML syntax in profile '{$profileName}' at line {$lineNumber}: ".$e->getMessage());
        }

        if (! is_array($data)) {
            Log::error('Profile configuration is not an array', [
                'profilePath' => $realProfilePath,
                'dataType' => gettype($data),
            ]);

            throw new RuntimeException("The profile configuration in '{$profileName}' must be an array, ".gettype($data).' given.');
        }

        // Handle profile extension if specified.
        if (isset($data['extends'])) {
            $baseProfileName = $data['extends'];
            $guesser = new ProfileGuesser($this->projectPath);
            $baseProfilePath = $guesser->getProfilePath($baseProfileName);

            if (! $baseProfilePath) {
                $searchedLocations = [
                    $this->projectPath.'/.ctree/'.$baseProfileName,
                    copytree_path('profiles').'/'.$baseProfileName,
                ];

                Log::error('Base profile not found', [
                    'baseProfile' => $baseProfileName,
                    'extendedBy' => $profileName,
                    'searchedLocations' => $searchedLocations,
                ]);

                throw new RuntimeException(
                    "Base profile '{$baseProfileName}' extended by '{$profileName}' not found. Searched in: ".
                    implode(', ', $searchedLocations)
                );
            }

            try {
                // Recursive call with the normalized $loadedProfiles.
                $baseData = $this->loadProfileData($baseProfilePath, $loadedProfiles);
                $data = $this->mergeProfiles($baseData, $data);
            } catch (RuntimeException $e) {
                throw new RuntimeException(
                    "Error processing base profile '{$baseProfileName}' extended by '{$profileName}': ".$e->getMessage()
                );
            }
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
     *
     * @throws RuntimeException If the profile data cannot be merged properly.
     */
    private function mergeProfiles(array $baseData, array $currentData): array
    {
        // Check if both inputs are arrays before attempting to merge
        if (! is_array($baseData) || ! is_array($currentData)) {
            $baseType = gettype($baseData);
            $currentType = gettype($currentData);

            Log::error('Invalid profile data types for merging', [
                'baseDataType' => $baseType,
                'currentDataType' => $currentType,
            ]);

            throw new RuntimeException(
                "Cannot merge profile data: Base profile is {$baseType}, current profile is {$currentType}. Both must be arrays."
            );
        }

        // Start with the current data to preserve any unique keys.
        $merged = $currentData;

        // Concatenate arrays for keys where order matters.
        $concatKeys = ['include', 'exclude', 'external', 'transforms'];
        foreach ($concatKeys as $key) {
            if (isset($baseData[$key])) {
                if (isset($merged[$key]) && ! is_array($merged[$key])) {
                    Log::error('Invalid value type for key in profile', [
                        'key' => $key,
                        'expectedType' => 'array',
                        'actualType' => gettype($merged[$key]),
                    ]);

                    throw new RuntimeException(
                        "Cannot merge profiles: '{$key}' must be an array in the current profile, ".
                        gettype($merged[$key]).' given.'
                    );
                }

                if (! is_array($baseData[$key])) {
                    Log::error('Invalid value type for key in base profile', [
                        'key' => $key,
                        'expectedType' => 'array',
                        'actualType' => gettype($baseData[$key]),
                    ]);

                    throw new RuntimeException(
                        "Cannot merge profiles: '{$key}' must be an array in the base profile, ".
                        gettype($baseData[$key]).' given.'
                    );
                }

                $merged[$key] = array_merge($baseData[$key], $merged[$key] ?? []);
            }
        }

        // Merge "always" as a separate list.
        if (isset($baseData['always']) || isset($currentData['always'])) {
            // Validate that both are arrays if they exist
            if (isset($baseData['always']) && ! is_array($baseData['always'])) {
                throw new RuntimeException(
                    "Cannot merge profiles: 'always' must be an array in the base profile, ".
                    gettype($baseData['always']).' given.'
                );
            }

            if (isset($currentData['always']) && ! is_array($currentData['always'])) {
                throw new RuntimeException(
                    "Cannot merge profiles: 'always' must be an array in the current profile, ".
                    gettype($currentData['always']).' given.'
                );
            }

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
