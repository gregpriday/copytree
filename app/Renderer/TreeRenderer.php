<?php

namespace App\Renderer;

use App\Services\ByteCounter;
use Symfony\Component\Finder\SplFileInfo;

class TreeRenderer
{
    /**
     * Render the directory tree from an array of SplFileInfo objects.
     *
     * @param  SplFileInfo[]  $files
     */
    public function render(array $files): string
    {
        $tree = $this->buildTree($files);
        $content = $this->renderTree($tree);
        ByteCounter::count($content);

        return $content;
    }

    /**
     * Build a nested tree structure from the list of files.
     *
     * Each file's relative path is split into its directory parts and inserted into a nested array.
     *
     * @param  SplFileInfo[]  $files
     */
    protected function buildTree(array $files): array
    {
        $tree = [];
        foreach ($files as $file) {
            // Use the Finder method getRelativePathname() to obtain the file's path relative to the base directory.
            $relativePath = $file->getRelativePathname();
            // Split the path into parts based on the directory separator.
            $parts = explode(DIRECTORY_SEPARATOR, $relativePath);
            $current = &$tree;
            foreach ($parts as $part) {
                if (! isset($current[$part])) {
                    $current[$part] = [];
                }
                $current = &$current[$part];
            }
        }

        return $tree;
    }

    /**
     * Recursively render the nested tree structure into a string.
     *
     * This method uses ASCII characters to draw a tree similar to the "tree" command.
     *
     * @param  array  $tree  The nested tree array.
     * @param  string  $prefix  The prefix string used for indentation.
     */
    protected function renderTree(array $tree, string $prefix = ''): string
    {
        $output = '';
        $keys = array_keys($tree);
        $lastKey = end($keys);

        foreach ($tree as $name => $subtree) {
            $isLast = ($name === $lastKey);
            $output .= $prefix.($isLast ? '└── ' : '├── ').$name."\n";

            if (! empty($subtree)) {
                $newPrefix = $prefix.($isLast ? '    ' : '│   ');
                $output .= $this->renderTree($subtree, $newPrefix);
            }
        }

        return $output;
    }
}
