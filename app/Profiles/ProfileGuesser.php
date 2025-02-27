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

    /**
     * Constructor.
     *
     * @param  string  $projectPath  The base path of the project.
     */
    public function __construct(string $projectPath)
    {
        $this->projectPath = rtrim($projectPath, DIRECTORY_SEPARATOR);
    }

    /**
     * Guess the appropriate profile name for the project.
     *
     * Checks in the following order:
     * 1. If a dedicated profile file exists at ".ctree/profile.yaml" or ".ctree/profile.yml", returns "profile".
     * 2. If a legacy ruleset file exists at ".ctree/ruleset.yaml" or ".ctree/ruleset.yml", returns "ruleset".
     * 3. If the project structure indicates Laravel, returns "laravel".
     * 4. If the project structure indicates SvelteKit, returns "sveltekit".
     * 5. Otherwise, returns "default".
     *
     * @return ?string The guessed profile name.
     */
    public function guess(): ?string
    {
        $ctreeDirectory = $this->projectPath.DIRECTORY_SEPARATOR.'.ctree';

        if (file_exists($ctreeDirectory.DIRECTORY_SEPARATOR.'profile.yaml') || file_exists($ctreeDirectory.DIRECTORY_SEPARATOR.'profile.yml')) {
            return 'profile';
        }

        if (file_exists($ctreeDirectory.DIRECTORY_SEPARATOR.'ruleset.yaml') || file_exists($ctreeDirectory.DIRECTORY_SEPARATOR.'ruleset.yml')) {
            return 'ruleset';
        }

        if ($this->isLaravelProject()) {
            return 'laravel';
        }

        if ($this->isSvelteKitProject()) {
            return 'sveltekit';
        }

        return null;
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
     * Searches first in the ".ctree" directory (e.g. ".ctree/laravel.yaml" or ".ctree/laravel.yml")
     * and then in the global "profiles" folder at the project root.
     *
     * @param  string  $profileName  The profile name to look up.
     * @return string The absolute path to the profile file.
     *
     * @throws RuntimeException if no profile file is found.
     */
    public function getProfilePath(?string $profileName): ?string
    {
        // Look in the .ctree directory first.
        $ctreeDir = $this->projectPath.DIRECTORY_SEPARATOR.'.ctree';
        $possibleExtensions = ['yaml', 'yml'];

        foreach ($possibleExtensions as $ext) {
            $profilePath = $ctreeDir.DIRECTORY_SEPARATOR.$profileName.'.'.$ext;
            if (file_exists($profilePath)) {
                return realpath($profilePath);
            }
        }

        // Fallback to the profiles directory at the project root.
        $profilesDir = base_path('profiles');
        foreach ($possibleExtensions as $ext) {
            $profilePath = $profilesDir.DIRECTORY_SEPARATOR.$profileName.'.'.$ext;
            if (file_exists($profilePath)) {
                return realpath($profilePath);
            }
        }

        return null;
    }
}
