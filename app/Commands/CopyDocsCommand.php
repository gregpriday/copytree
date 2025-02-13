<?php

namespace App\Commands;

use LaravelZero\Framework\Commands\Command;
use Symfony\Component\Console\Input\ArrayInput;

class CopyDocsCommand extends Command
{
    /**
     * The signature of the command.
     *
     * All parameters are defined as options so that nothing is required.
     */
    protected $signature = 'copy:docs
        {--o|output= : (Optional) Output to a file (the filename is always "profile-docs.txt").}
        {--i|display : (Optional) Display output in the console.}
        {--S|stream : (Optional) Stream output directly.}
        {--r|as-reference : (Optional) Copy a reference to a temporary file.}';

    /**
     * The description of the command.
     */
    protected $description = 'Copies out the profile docs using a fixed output filename ("profile-docs.txt") if outputting to a file.';

    /**
     * Execute the command.
     *
     * This command sets a fixed source (the "docs/profiles" directory) and passes along the
     * relevant options (output, display, stream, as-reference) to the main CopyTreeCommand.
     *
     * @throws \Symfony\Component\Console\Exception\ExceptionInterface
     */
    public function handle(): int
    {
        // Set the fixed source path for profile docs.
        $fixedPath = base_path('docs/profiles');

        // Build the basic input array for the main command.
        $inputArray = [
            'command' => 'copy',
            'path' => $fixedPath,
        ];

        // Get all options; they are all optional.
        $options = $this->options();

        // Force the output option to "profile-docs.txt" if provided.
        if (! empty($options['output'])) {
            $options['output'] = 'profile-docs.txt';
        }

        // Convert the options to the "--option" format.
        foreach ($options as $key => $value) {
            if (empty($value)) {
                continue;
            }
            $inputArray['--'.$key] = $value;
        }

        // Retrieve and run the main CopyTreeCommand.
        $command = $this->getApplication()->find('copy');

        return $command->run(new ArrayInput($inputArray), $this->output);
    }
}
