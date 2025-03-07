<?php

namespace App\Pipeline\Stages;

use App\Pipeline\FilePipelineStageInterface;
use Closure;
use Symfony\Component\Finder\SplFileInfo;

class NPMStage implements FilePipelineStageInterface
{
    /**
     * The base path of the project.
     */
    protected string $basePath;

    /**
     * Create a new NPMStage instance.
     *
     * @param  string  $basePath  The base path of the project.
     */
    public function __construct(string $basePath)
    {
        $this->basePath = rtrim($basePath, DIRECTORY_SEPARATOR);
    }

    /**
     * Process the file collection and add node_modules instruction files.
     *
     * This stage checks for package.json and, if found, looks for instruction files
     * in node_modules/_package_/.ctree/instructions.md for each package and includes them.
     *
     * @param  array  $files  An array of Symfony Finder SplFileInfo objects.
     * @param  \Closure  $next  The next stage in the pipeline.
     * @return array The processed file collection.
     */
    public function handle(array $files, Closure $next): array
    {
        // First look for package.json
        $packageJsonPath = $this->findPackageJson($files);

        if ($packageJsonPath === null) {
            // No package.json found, continue to next stage
            return $next($files);
        }

        // Read package.json to get list of packages
        $packages = $this->getPackagesFromPackageJson($packageJsonPath);

        if (empty($packages)) {
            // No packages found, continue to next stage
            return $next($files);
        }

        // Add instruction files from node_modules packages
        $additionalFiles = $this->findPackageInstructions($packages);

        // Merge the additional files with the existing files
        $mergedFiles = array_merge($files, $additionalFiles);

        // Continue to the next stage
        return $next($mergedFiles);
    }

    /**
     * Find package.json in the file collection.
     *
     * @param  array  $files  Array of SplFileInfo objects.
     * @return string|null Full path to package.json or null if not found.
     */
    protected function findPackageJson(array $files): ?string
    {
        foreach ($files as $file) {
            if ($file instanceof SplFileInfo && $file->getRelativePathname() === 'package.json') {
                return $file->getRealPath();
            }
        }

        // Check for package.json directly in the base path if not found in files
        $packageJsonPath = $this->basePath.DIRECTORY_SEPARATOR.'package.json';
        if (file_exists($packageJsonPath)) {
            return $packageJsonPath;
        }

        return null;
    }

    /**
     * Parse package.json to get the list of packages.
     *
     * @param  string  $packageJsonPath  Path to package.json
     * @return array Array of package names
     */
    protected function getPackagesFromPackageJson(string $packageJsonPath): array
    {
        try {
            $content = file_get_contents($packageJsonPath);
            $data = json_decode($content, true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                // JSON parse error
                return [];
            }

            $packages = [];

            // Add packages from dependencies
            if (isset($data['dependencies']) && is_array($data['dependencies'])) {
                $packages = array_merge($packages, array_keys($data['dependencies']));
            }

            // Add packages from devDependencies
            if (isset($data['devDependencies']) && is_array($data['devDependencies'])) {
                $packages = array_merge($packages, array_keys($data['devDependencies']));
            }

            // Add packages from peerDependencies
            if (isset($data['peerDependencies']) && is_array($data['peerDependencies'])) {
                $packages = array_merge($packages, array_keys($data['peerDependencies']));
            }

            // Add packages from optionalDependencies
            if (isset($data['optionalDependencies']) && is_array($data['optionalDependencies'])) {
                $packages = array_merge($packages, array_keys($data['optionalDependencies']));
            }

            // Filter out any non-package entries (can happen with special entries in package.json)
            $packages = array_filter($packages, function ($package) {
                return is_string($package) && $package !== '' &&
                    ! str_starts_with($package, '@types/') && // Optionally filter out TypeScript type definitions
                    $package !== 'node';
            });

            return array_values(array_unique($packages));
        } catch (\Exception $e) {
            return [];
        }
    }

    /**
     * Find instruction files for packages.
     *
     * @param  array  $packages  Array of package names
     * @return array Array of SplFileInfo objects for instruction files
     */
    protected function findPackageInstructions(array $packages): array
    {
        $instructionFiles = [];
        $nodeModulesPath = $this->basePath.DIRECTORY_SEPARATOR.'node_modules';

        if (! is_dir($nodeModulesPath)) {
            return [];
        }

        foreach ($packages as $package) {
            // Handle scoped packages (@org/package-name)
            if (str_starts_with($package, '@')) {
                $parts = explode('/', $package, 2);
                if (count($parts) === 2) {
                    $scope = $parts[0];
                    $name = $parts[1];

                    $packagePath = $nodeModulesPath.DIRECTORY_SEPARATOR.
                        $scope.DIRECTORY_SEPARATOR.
                        $name;
                } else {
                    continue; // Invalid scoped package format
                }
            } else {
                $packagePath = $nodeModulesPath.DIRECTORY_SEPARATOR.$package;
            }

            $instructionPath = $packagePath.DIRECTORY_SEPARATOR.
                '.ctree'.DIRECTORY_SEPARATOR.
                'instructions.md';

            if (file_exists($instructionPath)) {
                // Create a SplFileInfo object for the instruction file
                $relativePath = str_replace($this->basePath.DIRECTORY_SEPARATOR, '', $packagePath.DIRECTORY_SEPARATOR.'.ctree');
                $relativePath = str_replace('\\', '/', $relativePath); // Normalize path separators

                $relativePathname = $relativePath.'/instructions.md';

                $instructionFiles[] = new SplFileInfo(
                    $instructionPath,
                    $relativePath,
                    $relativePathname
                );
            }
        }

        return $instructionFiles;
    }
}
