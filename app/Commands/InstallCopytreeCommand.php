<?php

namespace App\Commands;

use Gemini\Laravel\Facades\Gemini;
use Illuminate\Support\Facades\File;
use LaravelZero\Framework\Commands\Command;

class InstallCopytreeCommand extends Command
{
    /**
     * The signature of the command.
     *
     * @var string
     */
    protected $signature = 'install:copytree';

    /**
     * The description of the command.
     *
     * @var string
     */
    protected $description = 'Sets up the Copytree environment, including directory creation and Gemini API key configuration';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $this->info('Welcome to Copytree installation!');
        $this->line('This will set up the necessary directories and configuration for Copytree.');

        // Step 1: Create the ~/.copytree directory
        $copyTreeDir = copytree_path();
        if (! is_dir($copyTreeDir)) {
            $this->line('Creating Copytree directory at: '.$copyTreeDir);
            if (! mkdir($copyTreeDir, 0755, true) && ! is_dir($copyTreeDir)) {
                $this->error('Failed to create the Copytree directory.');

                return self::FAILURE;
            }
            $this->info('✓ Copytree directory created successfully.');
        } else {
            $this->info('✓ Copytree directory already exists.');
        }

        // Create subdirectories if they don't exist
        $subdirs = ['cache', 'outputs', 'repos'];
        foreach ($subdirs as $subdir) {
            $path = copytree_path($subdir);
            if (! is_dir($path)) {
                if (! mkdir($path, 0755, true) && ! is_dir($path)) {
                    $this->error("Failed to create the {$subdir} directory.");

                    return self::FAILURE;
                }
                $this->info("✓ Created {$subdir} directory.");
            }
        }

        // Step 2: Check for existing .env file
        $envPath = $copyTreeDir.'/.env';
        $envExists = file_exists($envPath);

        // Step 3: Check if Gemini API key is already set
        $geminiKey = null;
        if ($envExists) {
            $envContent = file_get_contents($envPath);
            preg_match('/GEMINI_API_KEY=([^\s]+)/', $envContent, $matches);
            if (isset($matches[1]) && ! empty($matches[1])) {
                $geminiKey = $matches[1];
                $this->info('✓ Found existing Gemini API key.');
            }
        }

        // Step 4: If no key exists, ask the user to provide one
        if (! $geminiKey) {
            $this->line('');
            $this->line('A Gemini API key is required for AI features.');
            $this->line('You can get one from: https://makersuite.google.com');
            $this->line('');

            $geminiKey = $this->secret('Enter your Gemini API key');

            if (empty($geminiKey)) {
                $this->warn('No API key provided. AI features will not be available.');
            }
        }

        // Step 5: Test the Gemini API key if provided
        if ($geminiKey) {
            $this->line('Testing Gemini API key...');

            try {
                // Set the key in env for testing
                putenv("GEMINI_API_KEY={$geminiKey}");

                // Try to make a simple request
                $response = Gemini::generativeModel(model: config('gemini.model'))
                    ->generateContent('Hello, this is a test from Copytree installation.');

                if ($response && $response->text()) {
                    $this->info('✓ Gemini API key is valid!');

                    // Create or update the .env file
                    $envContent = $envExists ? file_get_contents($envPath) : '';

                    if (strpos($envContent, 'GEMINI_API_KEY=') !== false) {
                        // Update existing key
                        $envContent = preg_replace('/GEMINI_API_KEY=([^\s]*)/', "GEMINI_API_KEY={$geminiKey}", $envContent);
                    } else {
                        // Add new key
                        $envContent .= "\nGEMINI_API_KEY={$geminiKey}\n";
                    }

                    file_put_contents($envPath, $envContent);
                    $this->info('✓ API key saved to .env file.');
                } else {
                    $this->error('Invalid API key response.');

                    return self::FAILURE;
                }
            } catch (\Exception $e) {
                $this->error('API key test failed: '.$e->getMessage());

                return self::FAILURE;
            }
        }

        // All done!
        $this->line('');
        $this->info('🎉 Copytree installation completed successfully!');

        return self::SUCCESS;
    }
}
