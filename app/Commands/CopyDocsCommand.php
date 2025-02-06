<?php

namespace App\Commands;

use LaravelZero\Framework\Commands\Command;
use Symfony\Component\Console\Input\ArrayInput;

class CopyDocsCommand extends Command
{
    /**
     * The signature of the command.
     */
    protected $signature = 'copy:docs
        {--f|filter=* : Filter files using glob patterns.}
        {--a|ai-filter=? : Filter files using a natural language description.}
        {--o|output? : Output to a file (the filename is always "profile-docs.txt").}
        {--i|display : Display output in the console.}
        {--S|stream : Stream output directly.}
        {--r|as-reference : Copy a reference to a temporary file.}';

    /**
     * The description of the command.
     */
    protected $description = 'Copies out the profile docs using a fixed output filename ("profile-docs.txt") if outputting to a file.';

    /**
     * Execute the command.
     *
     * This command simply sets a fixed source (here, the "rulesets" directory is used as a stand‐in for profile docs)
     * and passes along only the relevant options (filter, ai-filter, search, output, display, stream, as-reference)
     * to the main CopyTreeCommand.
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

        // Get all options and remove those that don't apply.
        $options = $this->options();

        // If an output file is specified, force it to "profile-docs.txt".
        if (isset($options['output'])) {
            $options['output'] = 'profile-docs.txt';
        }

        // Merge the remaining options with the arguments.
        $args = array_merge($args, $options);

        // Retrieve and run the main CopyTreeCommand.
        $command = $this->getApplication()->find('copy');

        return $command->run(new ArrayInput($args), $this->output);
    }
}
