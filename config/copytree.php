<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Global Excluded Directories
    |--------------------------------------------------------------------------
    |
    | These are directory names that Finder will ignore regardless of where they
    | appear in your project. This list includes version control directories,
    | IDE/editor configuration folders, dependency directories, cache folders,
    | virtual environment directories, and auto-generated checkpoint folders.
    |
    */
    'global_excluded_directories' => [
        // Version control directories
        '.git',
        '.svn',
        '.hg',
        '.bzr',
        'CVS',

        // IDE/editor directories
        '.idea',
        '.vscode',
        '.vs',
        '.settings',
        'nbproject',
        '.Rproj.user',

        // Cache & dependency directories
        '__pycache__',
        'node_modules',
        'bower_components',
        'jspm_packages',
        'web_modules',
        '.npm',
        '.yarn',

        // Virtual environments
        'venv',
        'env',
        '.env',
        '.venv',

        // Jupyter Notebook checkpoints
        '.ipynb_checkpoints',

        // Additional cache directories common in projects
        '.pytest_cache',
    ],

    /*
    |--------------------------------------------------------------------------
    | Base Path Excluded Directories
    |--------------------------------------------------------------------------
    |
    | Files that reside in directories immediately under the base path listed here
    | will be excluded. These directories usually contain third-party dependencies
    | or repository configuration rather than source code.
    |
    */
    'base_path_excluded_directories' => [
        'vendor',    // Common in PHP projects
        'Pods',      // Common in iOS projects using CocoaPods
        '.github',   // Repository configuration for GitHub (CI, issue templates, etc.)
        '.gitlab',   // GitLab configuration
        '.circleci', // CircleCI configuration
    ],

    /*
    |--------------------------------------------------------------------------
    | Global Excluded Files
    |--------------------------------------------------------------------------
    |
    | These are file names or patterns that should be excluded because they are
    | auto-generated, environment-specific, or compiled artifacts that add little
    | context for code analysis but consume tokens.
    |
    */
    'global_excluded_files' => [
        // Dependency lock files
        'package-lock.json',
        'yarn.lock',
        'composer.lock',
        'Pipfile.lock',
        'Gemfile.lock',
        'Cargo.lock',
        'Packages.resolved',

        // Operating system artifacts
        '.DS_Store',

        // Environment and log files
        '.env',
        '.env.local',
        '*.log',
        'npm-debug.log',
        'yarn-error.log',

        // Build artifacts / compiled files
        '*.pyc',
        '*.pyo',
        '*.class',
        '*.o',
        '*.obj',
        '*.exe',
        '*.dll',
        '*.so',
        '*.dylib',

        // Test cache files
        '.phpunit.result.cache',
    ],

];
