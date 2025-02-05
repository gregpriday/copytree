<?php

if (! function_exists('copytree_path')) {
    /**
     * Get the copytree base directory path.
     *
     * This function returns the base directory used for copytree operations.
     * It checks for a COPYTREE_DIRECTORY environment variable and falls back to "$HOME/.copytree" if none is provided.
     *
     * @param  string  $path  An optional subpath to append to the copytree directory.
     */
    function copytree_path(string $path = ''): string
    {
        $directory = getenv('COPYTREE_DIRECTORY') ?: getenv('HOME').DIRECTORY_SEPARATOR.'.copytree';

        return $path ? $directory.DIRECTORY_SEPARATOR.ltrim($path, DIRECTORY_SEPARATOR) : $directory;
    }
}
