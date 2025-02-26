<?php

namespace App\Pipeline;

use App\Utilities\Git\GitIgnoreManager;
use InvalidArgumentException;
use Symfony\Component\Finder\Finder;
use Symfony\Component\Finder\SplFileInfo;

class FileLoader
{
    protected string $basePath;

    /**
     * Global directories to exclude from scanning.
     *
     * Loaded from the config file (config/copytree.php).
     */
    protected array $globalExcludedDirectories;

    /**
     * Base path directories to exclude (only if found immediately under the base path).
     *
     * Loaded from the config file (config/copytree.php).
     */
    protected array $basePathExcludedDirectories;

    /**
     * Global files to exclude from scanning.
     *
     * Loaded from the config file (config/copytree.php).
     */
    protected array $globalExcludedFiles;

    /**
     * Create a new FileLoader instance.
     *
     * @param  string  $basePath  The directory path to scan.
     *
     * @throws InvalidArgumentException If the provided path is not a valid directory.
     */
    public function __construct(string $basePath)
    {
        if (! is_dir($basePath)) {
            throw new InvalidArgumentException("The path {$basePath} is not a valid directory.");
        }

        // Store the absolute (real) path.
        $this->basePath = realpath($basePath);

        // Load exclusion settings from the config file.
        $this->globalExcludedDirectories = config('copytree.global_excluded_directories', []);
        $this->basePathExcludedDirectories = config('copytree.base_path_excluded_directories', []);
        $this->globalExcludedFiles = config('copytree.global_excluded_files', []);
    }

    /**
     * Load files from the base path.
     *
     * This method uses Symfony Finder to locate all files (recursively) in the base directory,
     * applying global directory and file exclusions directly via Finder. Then, it filters out files
     * whose relative path indicates they are located in a base path directory that should be excluded.
     * Finally, it applies Git ignore rules by using the GitIgnoreManager.
     *
     * Additionally, any filenames provided in the $always parameter will be added even if they
     * would have otherwise been excluded.
     *
     * @param  int|null  $maxDepth  Optional maximum depth (if null, no depth limit is applied).
     * @param  array  $always  An array of relative filenames that must always be included.
     * @return SplFileInfo[] An array of SplFileInfo objects.
     */
    public function loadFiles(?int $maxDepth = null, array $always = []): array
    {
        $finder = new Finder;
        $finder->files()->in($this->basePath);

        // Exclude directories globally.
        if (! empty($this->globalExcludedDirectories)) {
            $finder->exclude($this->globalExcludedDirectories);
        }

        // Exclude files globally.
        if (! empty($this->globalExcludedFiles)) {
            $finder->notName($this->globalExcludedFiles);
        }

        // Apply max depth if provided.
        if ($maxDepth !== null) {
            $finder->depth('<= '.$maxDepth);
        }

        $files = [];
        /** @var SplFileInfo $file */
        foreach ($finder as $file) {
            $files[] = $file;
        }

        // Filter out files that reside in a base path directory that should be excluded.
        $files = array_filter($files, function (SplFileInfo $file) {
            $relativePath = $file->getRelativePathname();
            // Extract the first directory (if any) from the relative path.
            $parts = explode(DIRECTORY_SEPARATOR, $relativePath);
            if (isset($parts[0]) && in_array($parts[0], $this->basePathExcludedDirectories, true)) {
                return false;
            }

            return true;
        });

        // Filter out files that are ignored by Git ignore rules.
        $gitIgnoreManager = new GitIgnoreManager($this->basePath);
        $files = array_filter($files, fn (SplFileInfo $file) => $gitIgnoreManager->accept($file));

        // Add "always" files: these files are included regardless of exclusion.
        foreach ($always as $filename) {
            $fullPath = $this->basePath.DIRECTORY_SEPARATOR.$filename;
            if (file_exists($fullPath)) {
                $alwaysFile = new SplFileInfo($fullPath, dirname($filename), $filename);
                $files[] = $alwaysFile;
            }
        }

        // Remove duplicate files based on relative path.
        $uniqueFiles = [];
        foreach ($files as $file) {
            $uniqueFiles[$file->getRelativePathname()] = $file;
        }

        return array_values($uniqueFiles);
    }
}
