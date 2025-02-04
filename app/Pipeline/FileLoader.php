<?php

namespace App\Pipeline;

use Symfony\Component\Finder\Finder;
use Symfony\Component\Finder\SplFileInfo;
use InvalidArgumentException;

class FileLoader
{
    protected string $basePath;

    /**
     * Directories to exclude from the scan.
     *
     * These are relative directory names (not paths) that Finder will ignore.
     */
    protected array $excludedDirectories = [
        '.git',
        '.svn',
        '.hg',
        '.idea',
        '.vscode',
        '__pycache__',
        'node_modules',
        'bower_components',
        '.npm',
        '.yarn',
        'venv',
        // Add more if needed
    ];

    /**
     * Create a new FileLoader instance.
     *
     * @param string $basePath The directory path to scan.
     * @param array  $excludedDirectories Optional list of directories to exclude (will be merged with defaults).
     *
     * @throws InvalidArgumentException If the provided path is not a valid directory.
     */
    public function __construct(string $basePath, array $excludedDirectories = [])
    {
        if (!is_dir($basePath)) {
            throw new InvalidArgumentException("The path {$basePath} is not a valid directory.");
        }

        // Store the absolute (real) path.
        $this->basePath = realpath($basePath);

        // Merge any additional excluded directories with our defaults.
        $this->excludedDirectories = array_unique(
            array_merge($this->excludedDirectories, $excludedDirectories)
        );
    }

    /**
     * Load files from the base path.
     *
     * This method uses Symfony Finder to locate all files (recursively) in the base directory,
     * while excluding directories that are known to contain huge amounts of files.
     *
     * @param int|null $maxDepth Optional maximum depth (if null, no depth limit is applied).
     *
     * @return SplFileInfo[] An array of SplFileInfo objects.
     */
    public function loadFiles(?int $maxDepth = null): array
    {
        $finder = new Finder();
        $finder->files()->in($this->basePath);

        // Exclude the directories.
        if (!empty($this->excludedDirectories)) {
            $finder->exclude($this->excludedDirectories);
        }

        // If a max depth is provided, apply it.
        if ($maxDepth !== null) {
            $finder->depth('<=' . $maxDepth);
        }

        $files = [];
        /** @var SplFileInfo $file */
        foreach ($finder as $file) {
            $files[] = $file;
        }

        return $files;
    }
}
