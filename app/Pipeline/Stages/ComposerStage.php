<?php

namespace App\Pipeline\Stages;

use App\Pipeline\FilePipelineStageInterface;
use Closure;
use Symfony\Component\Finder\SplFileInfo;

class ComposerStage implements FilePipelineStageInterface
{
    /**
     * The base path of the project.
     */
    protected string $basePath;

    /**
     * Create a new ComposerStage instance.
     *
     * @param  string  $basePath  The base path of the project.
     */
    public function __construct(string $basePath)
    {
        $this->basePath = rtrim($basePath, DIRECTORY_SEPARATOR);
    }

    /**
     * Process the file collection and add vendor instruction files.
     *
     * This stage checks for composer.json and, if found, looks for instruction files
     * in vendor/_vendor_/_package/.ctree/instructions.md for each package and includes them.
     *
     * @param  array  $files  An array of Symfony Finder SplFileInfo objects.
     * @param  \Closure  $next  The next stage in the pipeline.
     * @return array The processed file collection.
     */
    public function handle(array $files, Closure $next): array
    {
        // First look for composer.json
        $composerJsonPath = $this->findComposerJson($files);

        if ($composerJsonPath === null) {
            // No composer.json found, continue to next stage
            return $next($files);
        }

        // Read composer.json to get list of packages
        $packages = $this->getPackagesFromComposerJson($composerJsonPath);

        if (empty($packages)) {
            // No packages found, continue to next stage
            return $next($files);
        }

        // Add instruction files from vendor packages
        $additionalFiles = $this->findPackageInstructions($packages);

        // Merge the additional files with the existing files
        $mergedFiles = array_merge($files, $additionalFiles);

        // Continue to the next stage
        return $next($mergedFiles);
    }

    /**
     * Find composer.json in the file collection.
     *
     * @param  array  $files  Array of SplFileInfo objects.
     * @return string|null Full path to composer.json or null if not found.
     */
    protected function findComposerJson(array $files): ?string
    {
        foreach ($files as $file) {
            if ($file instanceof SplFileInfo && $file->getRelativePathname() === 'composer.json') {
                return $file->getRealPath();
            }
        }

        // Check for composer.json directly in the base path if not found in files
        $composerJsonPath = $this->basePath.DIRECTORY_SEPARATOR.'composer.json';
        if (file_exists($composerJsonPath)) {
            return $composerJsonPath;
        }

        return null;
    }

    /**
     * Parse composer.json to get the list of packages.
     *
     * @param  string  $composerJsonPath  Path to composer.json
     * @return array Array of package names in format 'vendor/package'
     */
    protected function getPackagesFromComposerJson(string $composerJsonPath): array
    {
        try {
            $content = file_get_contents($composerJsonPath);
            $data = json_decode($content, true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                // JSON parse error
                return [];
            }

            $packages = [];

            // Add packages from require
            if (isset($data['require']) && is_array($data['require'])) {
                $packages = array_merge($packages, array_keys($data['require']));
            }

            // Add packages from require-dev
            if (isset($data['require-dev']) && is_array($data['require-dev'])) {
                $packages = array_merge($packages, array_keys($data['require-dev']));
            }

            // Filter out packages that don't look like vendor/package
            $packages = array_filter($packages, function ($package) {
                return strpos($package, '/') !== false &&
                    ! in_array($package, ['php', 'ext-fileinfo', 'ext-mbstring', 'ext-gd']);
            });

            return array_values($packages);
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
        $vendorPath = $this->basePath.DIRECTORY_SEPARATOR.'vendor';

        if (! is_dir($vendorPath)) {
            return [];
        }

        foreach ($packages as $package) {
            [$vendor, $name] = explode('/', $package, 2);

            $instructionPath = $vendorPath.DIRECTORY_SEPARATOR.
                $vendor.DIRECTORY_SEPARATOR.
                $name.DIRECTORY_SEPARATOR.
                '.ctree'.DIRECTORY_SEPARATOR.
                'instructions.md';

            if (file_exists($instructionPath)) {
                // Create a SplFileInfo object for the instruction file
                $relativePath = 'vendor/'.$vendor.'/'.$name.'/.ctree';
                $relativePathname = 'vendor/'.$vendor.'/'.$name.'/.ctree/instructions.md';

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
