<?php

namespace App\Commands;

use Illuminate\Support\Facades\File;
use LaravelZero\Framework\Commands\Command;

class ProfileListCommand extends Command
{
    /**
     * The signature of the command.
     *
     * @var string
     */
    protected $signature = 'profile:list';

    /**
     * The description of the command.
     *
     * @var string
     */
    protected $description = 'Lists all available CopyTree profiles (project-specific and built-in)';

    /**
     * Execute the console command.
     *
     * @return int
     */
    public function handle(): int
    {
        $profiles = [];
        $projectPath = getcwd(); // Get current working directory

        // --- Find Project-Specific Profiles (.ctree) ---
        $projectCtreeDir = $projectPath . DIRECTORY_SEPARATOR . '.ctree';
        if (File::isDirectory($projectCtreeDir)) {
            // Use glob to find yaml and yml files
            $projectProfileFiles = array_merge(
                $this->globFiles($projectCtreeDir, '*.yaml'),
                $this->globFiles($projectCtreeDir, '*.yml')
            );

            foreach ($projectProfileFiles as $filePath) {
                $profileName = pathinfo($filePath, PATHINFO_FILENAME);
                // Store with name as key to handle potential duplicates later
                $profiles[$profileName] = [
                    'name' => $profileName,
                    'type' => 'Project',
                    'path' => $filePath,
                ];
            }
        }

        // --- Find Built-in Profiles (profiles directory) ---
        $builtinProfilesDir = base_path('profiles');
        if (File::isDirectory($builtinProfilesDir)) {
             // Use glob to find yaml and yml files
            $builtinProfileFiles = array_merge(
                $this->globFiles($builtinProfilesDir, '*.yaml'),
                $this->globFiles($builtinProfilesDir, '*.yml')
            );

            foreach ($builtinProfileFiles as $filePath) {
                $profileName = pathinfo($filePath, PATHINFO_FILENAME);
                // Only add if not already defined as a project profile (project overrides built-in)
                if (!isset($profiles[$profileName])) {
                    $profiles[$profileName] = [
                        'name' => $profileName,
                        'type' => 'Built-in',
                        'path' => $filePath,
                    ];
                }
            }
        }

        // --- Display Profiles ---
        if (empty($profiles)) {
            $this->info('No CopyTree profiles found.');
            return self::SUCCESS;
        }

        // Sort profiles by name for consistent output
        ksort($profiles);

        // Prepare data for the table
        $tableData = [];
        foreach ($profiles as $profile) {
            // Make path relative to project or app base for readability
            $displayPath = str_starts_with($profile['path'], $projectPath)
                ? str_replace($projectPath . DIRECTORY_SEPARATOR, '', $profile['path'])
                : str_replace(base_path() . DIRECTORY_SEPARATOR, '', $profile['path']);

            $tableData[] = [
                'Name' => $profile['name'],
                'Type' => $profile['type'],
                'Path' => $displayPath,
            ];
        }

        $this->table(
            ['Name', 'Type', 'Path'],
            $tableData
        );

        return self::SUCCESS;
    }

    /**
     * Wrapper for the glob function to make testing easier.
     *
     * @param string $directory The directory to search in
     * @param string $pattern The glob pattern
     * @return array An array of file paths
     */
    protected function globFiles(string $directory, string $pattern): array
    {
        return glob($directory . DIRECTORY_SEPARATOR . $pattern);
    }
}
