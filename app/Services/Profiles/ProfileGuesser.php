<?php

namespace App\Services\Profiles;

use RuntimeException;

/**
 * Guesses the appropriate profile based on the project structure.
 */
class ProfileGuesser
{
    private string $projectPath;
    private array $availableProfiles;

    /**
     * Constructor.
     *
     * @param string $projectPath      The base path of the project.
     * @param array  $availableProfiles (Optional) An array of available profile names.
     */
    public function __construct(string $projectPath, array $availableProfiles = [])
    {
        $this->projectPath = rtrim($projectPath, DIRECTORY_SEPARATOR);
        $this->availableProfiles = $availableProfiles;
    }

    /**
     * Guess the appropriate profile for this project.
     *
     * The method checks for the following (in order):
     *
     * 1. If a dedicated profile file exists at .ctree/profile.json, returns "profile".
     * 2. If a legacy ruleset file exists at .ctree/ruleset.json, returns "ruleset".
     * 3. Uses heuristics to detect common project types (e.g. Laravel, SvelteKit).
     * 4. Returns "default" if no other match is found.
     *
     * @return string The guessed profile name.
     */
    public function guess(): string
    {
        $ctreeDir = $this->projectPath . DIRECTORY_SEPARATOR . '.ctree';

        // Check for the new profile file.
        if (file_exists($ctreeDir . DIRECTORY_SEPARATOR . 'profile.json')) {
            return 'profile';
        }

        // Fallback to legacy ruleset file.
        if (file_exists($ctreeDir . DIRECTORY_SEPARATOR . 'ruleset.json')) {
            return 'ruleset';
        }

        // Heuristic: detect Laravel project.
        if ($this->isLaravelProject()) {
            return 'laravel';
        }

        // Heuristic: detect SvelteKit project.
        if ($this->isSvelteKitProject()) {
            return 'sveltekit';
        }

        // More heuristics can be added here as needed.

        return 'default';
    }

    /**
     * Check if the project is a Laravel project.
     */
    private function isLaravelProject(): bool
    {
        return file_exists($this->projectPath . DIRECTORY_SEPARATOR . 'artisan')
            && is_dir($this->projectPath . DIRECTORY_SEPARATOR . 'app')
            && is_dir($this->projectPath . DIRECTORY_SEPARATOR . 'bootstrap')
            && is_dir($this->projectPath . DIRECTORY_SEPARATOR . 'config')
            && is_dir($this->projectPath . DIRECTORY_SEPARATOR . 'database');
    }

    /**
     * Check if the project is a SvelteKit project.
     */
    private function isSvelteKitProject(): bool
    {
        $packageJsonPath = $this->projectPath . DIRECTORY_SEPARATOR . 'package.json';
        if (! file_exists($packageJsonPath)) {
            return false;
        }

        $packageJson = json_decode(file_get_contents($packageJsonPath), true);
        return isset($packageJson['dependencies']['@sveltejs/kit'])
            || isset($packageJson['devDependencies']['@sveltejs/kit']);
    }

    /**
     * Retrieve the absolute path to a profile file based on a given profile name.
     *
     * This method supports both the legacy file naming (.ctree/ruleset.json) and the new one (.ctree/profile.json).
     *
     * @param string $profileName The profile name to retrieve.
     *
     * @return string|null The absolute path to the profile file, or null if not found.
     */
    public function getProfilePath(string $profileName): ?string
    {
        // First, check for a file (e.g., "laravel.json" in .ctree/).
        $profilePath = $this->projectPath . DIRECTORY_SEPARATOR . '.ctree' . DIRECTORY_SEPARATOR . $profileName . '.json';
        if (file_exists($profilePath)) {
            return realpath($profilePath);
        }

        // Next check the rulesets folder
        $profilePath = base_path('rulesets') . DIRECTORY_SEPARATOR . $profileName . '.json';
        if (file_exists($profilePath)) {
            return realpath($profilePath);
        }

        return null;
    }
}
