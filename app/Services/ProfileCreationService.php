<?php

namespace App\Services;

use Gemini\Data\Content;
use Gemini\Data\GenerationConfig;
use Gemini\Data\Schema;
use Gemini\Laravel\Facades\Gemini;
use Illuminate\Support\Facades\Artisan;
use RuntimeException;
use Symfony\Component\Yaml\Yaml;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Throwable;

class ProfileCreationService
{
    /**
     * The project directory to scan.
     */
    protected string $projectPath;

    /**
     * Maximum number of characters to extract per file (if needed).
     */
    protected int $charLimit;

    /**
     * Constructor.
     *
     * @param  string  $projectPath  The full path to the project.
     * @param  int  $charLimit  Maximum characters per file preview (default: 1500).
     */
    public function __construct(string $projectPath, int $charLimit = 1500)
    {
        $realPath = realpath($projectPath);
        if ($realPath === false) {
            throw new RuntimeException("Invalid project path provided: {$projectPath}");
        }
        $this->projectPath = $realPath;
        $this->charLimit = $charLimit;
    }

    /**
     * Helper function to call the "copy" command and return its trimmed output.
     *
     * The only default option is '--display' => true.
     *
     * @param  string  $path  The path to pass to the command.
     * @param  array  $overrides  Optional overrides for additional options.
     * @return string The trimmed output from the copy command.
     */
    protected function getCopytreeOutput(string $path, array $overrides = []): string
    {
        $defaultOptions = [
            'path' => $path,
            '--display' => true,
        ];
        $options = array_merge($defaultOptions, $overrides);
        Artisan::call('copy', $options);

        return trim(Artisan::output());
    }

    /**
     * Create a CopyTree profile using pre‐collected input by invoking the main copytree command.
     *
     * @param  array  $goals  An array of goal strings. These will be converted into a bullet list.
     * @return array The generated profile data.
     *
     * @throws RuntimeException if profile generation or parsing fails.
     */
    public function createProfile(array $goals): array
    {
        // 1. Get project output by invoking the main copytree command.
        //    Include '--max-characters' if needed via overrides.
        $projectOutput = $this->getCopytreeOutput($this->projectPath, [
            '--max-characters' => $this->charLimit,
        ]);

        // Also get a copytree of the /docs/profiles directory.
        $profilesDocsOutput = $this->getCopytreeOutput(base_path('docs/profiles'));

        // Get all the available transforms.
        $transformsOutput = $this->getCopytreeOutput(base_path('app/Transforms/Transformers'));

        // Load the example YAML instead of a JSON schema.
        $example = file_get_contents(base_path('docs/profiles/example.yaml'));

        if (empty($projectOutput)) {
            throw new RuntimeException('Failed to get output from the copytree command.');
        }

        // Convert the goals array into a bullet list.
        $goalsBulletList = implode("\n", array_map(function ($goal) {
            return '- '.$goal;
        }, $goals));

        // 2. Load the system prompt from system.txt.
        $systemPrompt = file_get_contents(base_path('prompts/profile-creation/system.txt'));
        $systemPrompt = str_replace(
            ['{{profilesDocsOutput}}', '{{transformsOutput}}', '{{example}}'],
            [$profilesDocsOutput, $transformsOutput, $example],
            $systemPrompt
        );

        // 3. Load the prompt template from prompt.txt and substitute placeholders.
        $prompt = file_get_contents(base_path('prompts/profile-creation/prompt.txt'));
        $prompt = str_replace(
            ['{{projectOutput}}', '{{goals}}', '{{example}}'],
            [$projectOutput, $goalsBulletList, $example],
            $prompt
        );

        // 4. Call Gemini to generate the profile.
        try {
            $response = Gemini::generativeModel(model: config('gemini.ask_model'))
                ->withSystemInstruction(Content::parse($systemPrompt))
                ->withGenerationConfig($this->getGenerationConfig())
                ->generateContent($prompt);
        } catch (\Exception $e) {
            throw new RuntimeException('Gemini API call failed: '.$e->getMessage());
        }

        $yamlResponse = $response->text() ?? '';
        if (empty($yamlResponse)) {
            throw new RuntimeException('Received empty profile YAML from Gemini.');
        }

        // Unwrap YAML code fences if present.
        $yamlContent = preg_replace('/^```(?:yaml)?\s*(.*?)\s*```$/s', '$1', $yamlResponse);

        // Parse the YAML to an array.
        try {
            $profileData = Yaml::parse($yamlContent);
        } catch (\Exception $e) {
            throw new RuntimeException('Failed to parse generated profile YAML: '.$e->getMessage());
        }

        if (! is_array($profileData)) {
            throw new RuntimeException('Generated profile YAML did not parse into an array.');
        }

        return $profileData;
    }

    /**
     * Saves the generated profile into the project's .ctree directory in YAML format.
     *
     * @param  string  $profileName  The name (without extension) for the profile.
     * @param  array  $profileData  The generated profile data.
     * @return string The full path to the saved profile.
     *
     * @throws RuntimeException if the profile cannot be saved.
     */
    public function saveProfile(string $profileName, array $profileData): string
    {
        // The profile directory is assumed to be ".ctree" under the project path.
        $profileDir = $this->projectPath.DIRECTORY_SEPARATOR.'.ctree';
        if (! is_dir($profileDir)) {
            if (! mkdir($profileDir, 0755, true) && ! is_dir($profileDir)) {
                throw new RuntimeException("Failed to create profile directory: {$profileDir}");
            }
        }
        // Save the profile with a .yaml extension.
        $profilePath = $profileDir.DIRECTORY_SEPARATOR.$profileName.'.yaml';
        $profileYaml = Yaml::dump($profileData, 4, 2);
        if (file_put_contents($profilePath, $profileYaml) === false) {
            throw new RuntimeException("Failed to save the profile to {$profilePath}");
        }

        return $profilePath;
    }

    private function getGenerationConfig(): GenerationConfig
    {
        return new GenerationConfig(
            maxOutputTokens: 4096,
        );
    }

    /**
     * Generate a user profile from a conversation history.
     *
     * @param  Collection  $messages  Collection of chat messages
     * @return string  Generated profile or null if unable to generate
     */
    public function generateProfile(Collection $messages): ?string
    {
        try {
            // Build the prompt for profile generation
            $prompt = $this->buildProfilePrompt($messages);

            // Configure the generation parameters
            $generationConfig = new GenerationConfig(
                maxOutputTokens: 4096,
                temperature: 0.4,
                topP: 0.8,
                topK: 30
            );

            // Make a request to Gemini for profile generation
            $response = Gemini::generativeModel(model: config('gemini.ask_model'))
                ->withGenerationConfig($generationConfig)
                ->generateContent($prompt);

            // Store and return the generated profile
            $profile = $response->text();
            if (! empty($profile)) {
                // Save the profile to the database
                $this->saveProfile($profile);
                return $profile;
            }

            return null;
        } catch (Throwable $e) {
            Log::error('Profile generation failed: '.$e->getMessage());
            return null;
        }
    }
}
