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
        {--f|filter=* : (Optional) Filter files using glob patterns.}
        {--a|ai-filter=? : (Optional) Filter files using a natural language description.}
        {--o|output? : (Optional) Output to a file (the filename is always "profile-docs.txt").}
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
     * relevant options (filter, ai-filter, output, display, stream, as-reference) to the main CopyTreeCommand.
     *
     * @throws \Symfony\Component\Console\Exception\ExceptionInterface
     */
    public function handle(): int
    {
        // Set the fixed source path for profile docs.
        $fixedPath = base_path('docs/profiles');

        // Build the basic argument list for the main command.
        $args = [
            'command' => 'copy',
            'path' => $fixedPath,
        ];

        // Get all options; they are all optional.
        $options = $this->options();

        // If an output file is specified, force it to "profile-docs.txt".
        if (isset($options['output'])) {
            $options['output'] = 'profile-docs.txt';
        }

        // Merge the options with the arguments.
        $args = array_merge($args, $options);

        // Retrieve and run the main CopyTreeCommand.
        $command = $this->getApplication()->find('copy');

        return $command->run(new ArrayInput($args), $this->output);
    }
}
