<?php

namespace App\Services;

use Gemini\Data\Content;
use Gemini\Data\GenerationConfig;
use Gemini\Data\Schema;
use Gemini\Enums\ResponseMimeType;
use Gemini\Laravel\Facades\Gemini;
use Illuminate\Support\Facades\Artisan;
use RuntimeException;

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
     * @param  int  $charLimit  Maximum characters per file preview (default 1500).
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
     * @throws RuntimeException if profile generation or saving fails.
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

        // Get the schema
        $schema = file_get_contents(base_path('docs/profiles/profile-schema.json'));

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
            ['{{profilesDocsOutput}}', '{{transformsOutput}}', '{{schema}}'],
            [$profilesDocsOutput, $transformsOutput, $schema],
            $systemPrompt
        );

        // 3. Load the prompt template from prompt.txt and substitute placeholders.
        $prompt = file_get_contents(base_path('prompts/profile-creation/prompt.txt'));
        $prompt = str_replace(
            ['{{projectOutput}}', '{{goals}}'],
            [$projectOutput, $goalsBulletList],
            $prompt
        );

        // 4. Call Gemini to generate the profile.
        try {
            $response = Gemini::generativeModel(model: config('gemini.model'))
                ->withSystemInstruction(Content::parse($systemPrompt))
                ->withGenerationConfig($this->getGenerationConfig())
                ->generateContent($prompt);
        } catch (\Exception $e) {
            throw new RuntimeException('Gemini API call failed: '.$e->getMessage());
        }

        $profileJson = $response->text() ?? '';
        if (empty($profileJson)) {
            throw new RuntimeException('Received empty profile JSON from Gemini.');
        }

        // Validate JSON.
        $profileData = json_decode($profileJson, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new RuntimeException('Generated profile JSON is invalid: '.json_last_error_msg());
        }

        return $profileData;
    }

    /**
     * Saves the generated profile JSON into the project’s .ctree directory.
     *
     * @param  string  $profileName  The name (without extension) for the profile.
     * @param  array  $profileData  The generated JSON content.
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
        $profilePath = $profileDir.DIRECTORY_SEPARATOR.$profileName.'.json';
        $profileJson = json_encode($profileData, JSON_PRETTY_PRINT);
        if (file_put_contents($profilePath, $profileJson) === false) {
            throw new RuntimeException("Failed to save the profile to {$profilePath}");
        }

        return $profilePath;
    }

    private function getGenerationConfig(): GenerationConfig
    {
        return new GenerationConfig(
            responseMimeType: ResponseMimeType::APPLICATION_JSON
        );
    }
}
