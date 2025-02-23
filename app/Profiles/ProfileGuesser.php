<?php

namespace App\Profiles;

use RuntimeException;

/**
 * Class ProfileGuesser
 *
 * Determines the most appropriate profile for a project based on its structure.
 * It first checks for dedicated or legacy profile files in the ".ctree" directory,
 * then applies heuristics (e.g. Laravel or SvelteKit detection) before finally
 * defaulting to "default" if no other match is found.
 */
class ProfileGuesser
{
    private string $projectPath;

    private array $availableProfiles;

    /**
     * Constructor.
     *
     * @param  string  $projectPath  The base path of the project.
     * @param  array  $availableProfiles  Optional list of available profile names.
     */
    public function __construct(string $projectPath, array $availableProfiles = [])
    {
        $this->projectPath = rtrim($projectPath, DIRECTORY_SEPARATOR);
        $this->availableProfiles = $availableProfiles;
    }

    /**
     * Guess the appropriate profile name for the project.
     *
     * Checks in the following order:
     * 1. If a dedicated profile file exists at ".ctree/profile.json", returns "profile".
     * 2. If a legacy ruleset file exists at ".ctree/ruleset.json", returns "ruleset".
     * 3. If the project structure indicates Laravel, returns "laravel".
     * 4. If the project structure indicates SvelteKit, returns "sveltekit".
     * 5. Otherwise, returns "default".
     *
     * @return string The guessed profile name.
     */
    public function guess(): string
    {
        $ctreeDirectory = $this->projectPath.DIRECTORY_SEPARATOR.'.ctree';

        if (file_exists($ctreeDirectory.DIRECTORY_SEPARATOR.'profile.json')) {
            return 'profile';
        }

        if (file_exists($ctreeDirectory.DIRECTORY_SEPARATOR.'ruleset.json')) {
            return 'ruleset';
        }

        if ($this->isLaravelProject()) {
            return 'laravel';
        }

        if ($this->isSvelteKitProject()) {
            return 'sveltekit';
        }

        return 'default';
    }

    /**
     * Determine if the project is a Laravel project.
     *
     * Checks for the existence of "artisan" and key Laravel directories.
     *
     * @return bool True if the project appears to be Laravel.
     */
    private function isLaravelProject(): bool
    {
        return file_exists($this->projectPath.DIRECTORY_SEPARATOR.'artisan')
            && is_dir($this->projectPath.DIRECTORY_SEPARATOR.'app')
            && is_dir($this->projectPath.DIRECTORY_SEPARATOR.'bootstrap')
            && is_dir($this->projectPath.DIRECTORY_SEPARATOR.'config')
            && is_dir($this->projectPath.DIRECTORY_SEPARATOR.'database');
    }

    /**
     * Determine if the project is a SvelteKit project.
     *
     * Looks for a "package.json" containing a dependency or devDependency on "@sveltejs/kit".
     *
     * @return bool True if the project appears to be SvelteKit.
     */
    private function isSvelteKitProject(): bool
    {
        $packageJsonPath = $this->projectPath.DIRECTORY_SEPARATOR.'package.json';
        if (! file_exists($packageJsonPath)) {
            return false;
        }

        $packageJson = json_decode(file_get_contents($packageJsonPath), true);

        return isset($packageJson['dependencies']['@sveltejs/kit'])
            || isset($packageJson['devDependencies']['@sveltejs/kit']);
    }

    /**
     * Retrieve the absolute path to the profile file for a given profile name.
     *
     * Searches first in the ".ctree" directory (e.g. ".ctree/laravel.json")
     * and then in the global "profiles" folder at the project root.
     *
     * @param  string  $profileName  The profile name to look up.
     * @return string The absolute path to the profile file.
     *
     * @throws RuntimeException if no profile file is found.
     */
    public function getProfilePath(string $profileName): string
    {
        // Look in the .ctree directory first.
        $profilePath = $this->projectPath.DIRECTORY_SEPARATOR.'.ctree'.DIRECTORY_SEPARATOR.$profileName.'.json';
        if (file_exists($profilePath)) {
            return realpath($profilePath);
        }

        // Fallback to the profiles directory at the project root.
        $profilePath = base_path('profiles').DIRECTORY_SEPARATOR.$profileName.'.json';
        if (file_exists($profilePath)) {
            return realpath($profilePath);
        }

        throw new RuntimeException("Profile '{$profileName}' not found.");
    }
}
