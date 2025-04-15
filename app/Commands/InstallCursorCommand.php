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
    protected $description = 'Installs the Cursor rules for CopyTree by creating the .cursor/rules/ directory and linking the copytree.mdc file.';

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
        // Check if anything exists at the destination path (file or link)
        $destinationExists = file_exists($destFile) || is_link($destFile);
        $confirmMessage = $destinationExists
            ? 'An item (file or link) already exists at '.$destFile.'. Do you want to replace it with a symlink to the source rules file?'
            : 'Do you want to create a symlink at '.$destFile.' pointing to the source rules file?';
        // Default to 'yes' if it doesn't exist, 'no' if it does
        $default = ! $destinationExists;

        if ($this->confirm($confirmMessage, $default)) {
            // Step 4: Create the symlink if confirmed
            try {
                // If something exists at the destination, remove it first
                if (file_exists($destFile) || is_link($destFile)) {
                    if (! unlink($destFile)) {
                        // Throw an exception if deletion fails
                        throw new \RuntimeException("Could not remove existing item at {$destFile}");
                    }
                    $this->comment('Removed existing item at: '.$destFile);
                }

                // Create the symbolic link (target, link)
                if (symlink($sourceFile, $destFile)) {
                    $this->info('Symlink created successfully at: '.$destFile);
                } else {
                    // Throw an exception if symlink creation fails
                    throw new \RuntimeException("Failed to create symlink from {$sourceFile} to {$destFile}");
                }
            } catch (\Exception $e) {
                // Catch any exception during delete or symlink creation
                $this->error('Error creating symlink: '.$e->getMessage());

                return self::FAILURE;
            }
        } else {
            $this->info('Symlink creation aborted by user.');
        }

        return self::SUCCESS;
    }
}
