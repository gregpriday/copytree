<?php

namespace App\Commands;

use App\Services\ProfileCreationService;
use LaravelZero\Framework\Commands\Command;
use Symfony\Component\Process\Process;

class CreateProfileCommand extends Command
{
    /**
     * The signature of the command.
     *
     * Accepts an optional project directory (defaults to the current working directory)
     * and an optional character limit (default: 1000) for file content extraction.
     */
    protected $signature = 'profile:create
        {path? : The project directory (defaults to current working directory)}
        {--c|char-limit=1000 : Maximum number of characters per file for profile creation}';

    /**
     * The description of the command.
     */
    protected $description = 'Creates a new CopyTree profile by scanning project files and interactively collecting user goals';

    /**
     * Execute the command.
     */
    public function handle(): int
    {
        // Determine the project directory.
        $projectPath = $this->argument('path') ?: getcwd();
        if (! is_dir($projectPath)) {
            $this->error("The provided path is not a valid directory: {$projectPath}");
            return self::FAILURE;
        }
        $this->info("Using project directory: {$projectPath}");

        // Get the character limit from the option.
        $charLimit = (int) $this->option('char-limit');

        // Ask the user for a list of goals (one by one).
        $this->info("Enter the primary goals for this profile. Press Enter without input to finish.");
        $goals = [];
        while (true) {
            $goal = $this->ask("Enter a goal");
            if (empty($goal)) {
                break;
            }
            $goals[] = $goal;
        }
        if (empty($goals)) {
            $this->warn("No goals entered. Aborting profile creation.");
            return self::FAILURE;
        }

        // Ask the user to provide a name for the new profile.
        $profileName = $this->ask("Enter a name for the new profile (without extension)", "default");
        if (empty($profileName)) {
            $this->error("Profile name is required.");
            return self::FAILURE;
        }

        // Instantiate the ProfileCreationService and create the profile.
        try {
            $service = new ProfileCreationService($projectPath, $charLimit);
            $profileData = $service->createProfile($goals);

            // Display the generated profile data.
            $this->info("Generated Profile Data:\n" . json_encode($profileData, JSON_PRETTY_PRINT));

            $profilePath = $service->saveProfile($profileName, $profileData);
            $this->info("Profile created and saved to: {$profilePath}");
            $this->revealInFinder($profilePath);
            return self::SUCCESS;
        } catch (\Exception $e) {
            $this->error("Error creating profile: " . $e->getMessage());
            return self::FAILURE;
        }
    }

    /**
     * Reveal the generated profile in Finder using AppleScript.
     *
     * @param string $filePath
     */
    private function revealInFinder(string $filePath): void
    {
        $script = sprintf(
            'tell application "Finder" to reveal POSIX file "%s"
            tell application "Finder" to activate',
            str_replace('"', '\"', $filePath)
        );
        $process = new Process(['osascript', '-e', $script]);
        $process->run();
    }
}
