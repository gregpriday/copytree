<?php

namespace App\Commands;

use Illuminate\Support\Facades\File;
use LaravelZero\Framework\Commands\Command;

class InstallCursorCommand extends Command
{
    /**
     * The signature of the command.
     *
     * @var string
     */
    protected $signature = 'install:cursor';

    /**
     * The description of the command.
     *
     * @var string
     */
    protected $description = 'Installs the Cursor rules for CopyTree by creating the .cursor/rules/ directory and copying the copytree.mdc file.';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        // Get the current working directory
        $cwd = getcwd();
        $targetDir = $cwd.DIRECTORY_SEPARATOR.'.cursor'.DIRECTORY_SEPARATOR.'rules';

        // Step 1: Ensure the target directory exists
        if (File::isDirectory($targetDir)) {
            $this->info('Directory already exists: '.$targetDir);
        } else {
            if (File::makeDirectory($targetDir, 0755, true)) {
                $this->info('Created directory: '.$targetDir);
            } else {
                $this->error('Failed to create directory: '.$targetDir);

                return self::FAILURE;
            }
        }

        // Step 2: Define source and destination file paths
        $sourceFile = base_path('resources/copytree.mdc');
        $destFile = $targetDir.DIRECTORY_SEPARATOR.'copytree.mdc';

        // Check if the source file exists
        if (! File::exists($sourceFile)) {
            $this->error('Source file does not exist: '.$sourceFile);

            return self::FAILURE;
        }

        // Step 3: Prompt user for confirmation
        $fileExists = File::exists($destFile);
        $confirmMessage = $fileExists
            ? 'The Cursor rules file (copytree.mdc) already exists in '.$targetDir.'. Do you want to overwrite it?'
            : 'Do you want to copy the Cursor rules file (copytree.mdc) into '.$targetDir.'?';
        $default = ! $fileExists; // Default to 'yes' if file doesn't exist, 'no' if it does

        if ($this->confirm($confirmMessage, $default)) {
            // Step 4: Copy the file if confirmed
            if (File::copy($sourceFile, $destFile)) {
                $this->info('File copied successfully to: '.$destFile);
            } else {
                $this->error('Failed to copy the file.');

                return self::FAILURE;
            }
        } else {
            $this->info('File copy aborted by user.');
        }

        return self::SUCCESS;
    }
}
