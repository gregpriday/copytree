<?php

namespace App\Services;

use Gemini\Data\Content;
use Gemini\Data\GenerationConfig;
use Gemini\Laravel\Facades\Gemini;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;
use ValueError;

class ProjectQuestionService
{
    /**
     * Maximum number of retries for API calls.
     */
    const MAX_RETRIES = 3;

    /**
     * Delay between retries in milliseconds.
     */
    const RETRY_DELAY_MS = 500;

    /**
     * The Gemini model to use, defaulting to the thinking model.
     */
    protected string $model;

    /**
     * The path to the directory containing expert system prompts.
     */
    protected string $promptsBaseDir;

    /**
     * Create a new ProjectQuestionService instance.
     */
    public function __construct()
    {
        // Use the model specifically configured for the Copytree Ask functionality
        $this->model = config('gemini.ask_model');
        // Set the base directory for expert prompts
        $this->promptsBaseDir = base_path('prompts/project-question');
    }

    /**
     * Ask a question about the project using a specified expert and stream the response.
     * Optionally includes conversation history for stateful interactions.
     *
     * @param  string  $projectCopytree  The copytree output of the project
     * @param  string  $question  The user's question about the project
     * @param  string  $expert  The expert to use (defaults to 'default')
     * @param  array  $history  Optional conversation history for stateful interactions
     * @return iterable The stream of partial responses from Gemini
     *
     * @throws RuntimeException When the system prompt cannot be found or the API call fails
     * @throws ValueError When the API returns no candidates after all retries
     */
    public function askQuestion(string $projectCopytree, string $question, string $expert = 'default', array $history = []): iterable
    {
        // Build the path to the expert's system prompt
        $expertPromptPath = $this->getExpertPromptPath($expert);

        // Load the system prompt from the expert's directory
        if (! File::exists($expertPromptPath)) {
            // If expert doesn't exist, fall back to the default expert
            if ($expert !== 'default') {
                return $this->askQuestion($projectCopytree, $question, 'default', $history);
            }

            throw new RuntimeException("System prompt for expert '{$expert}' not found at {$expertPromptPath}.");
        }

        $systemPrompt = File::get($expertPromptPath);

        // Format history as text if available
        $historyText = '';
        if (! empty($history)) {
            $historyText .= "Previous conversation:\n\n";
            foreach ($history as $histItem) {
                // Process text to remove XML tags if present
                $messageText = $histItem['content'];
                $messageText = preg_replace('/<ct:(summary|truncated)>(.*?)<\/ct:\1>/s', '$2', $messageText);

                $historyText .= ($histItem['role'] === 'user' ? 'User: ' : 'Assistant: ').$messageText."\n\n";
            }
            $historyText .= "Current question:\n\n";
        }

        // Build the combined prompt with history, project structure, and question
        $prompt = $historyText."Here is the project structure and files:\n\n{$projectCopytree}\n\nUser question: {$question}";

        // Configure the generation parameters
        $generationConfig = new GenerationConfig(
            maxOutputTokens: 32768,
            temperature: 0.15,
            topP: 0.95,
            topK: 40
        );

        try {
            // Use Laravel's retry helper
            return retry(self::MAX_RETRIES, function () use ($systemPrompt, $generationConfig, $prompt) {
                try {
                    // Stream content using Gemini thinking model
                    return Gemini::generativeModel(model: $this->model)
                        ->withSystemInstruction(Content::parse($systemPrompt))
                        ->withGenerationConfig($generationConfig)
                        ->streamGenerateContent($prompt);
                } catch (ValueError $e) {
                    // For ValueError, log the error
                    Log::warning('ValueError in askQuestion: '.$e->getMessage());

                    // Rethrow to trigger retry
                    throw $e;
                }
            }, self::RETRY_DELAY_MS);
        } catch (ValueError $e) {
            // This will only be triggered if all retries with ValueError fail
            Log::error('All retries failed with ValueError: '.$e->getMessage());
            throw $e; // Re-throw the ValueError for special handling upstream
        } catch (Throwable $e) {
            // For any other exception after all retries
            Log::error('Gemini API call failed after '.self::MAX_RETRIES.' attempts: '.$e->getMessage());
            throw new RuntimeException('Gemini API call failed after '.self::MAX_RETRIES.' attempts: '.$e->getMessage(), 0, $e);
        }
    }

    /**
     * Get the path to the expert's system prompt.
     *
     * @param  string  $expert  The expert name
     * @return string The full path to the expert's system prompt
     */
    protected function getExpertPromptPath(string $expert): string
    {
        $expertDir = $this->promptsBaseDir.'/'.$expert;

        // If the expert directory doesn't exist, use the default expert
        if (! File::isDirectory($expertDir)) {
            return $this->getExpertPromptPath('default');
        }

        return $expertDir.'/system.txt';
    }

    /**
     * Get a list of available experts with their descriptions.
     *
     * @return array An associative array where keys are expert names and values are their descriptions
     */
    public function getAvailableExperts(): array
    {
        $experts = [];

        // Check if the prompts directory exists
        if (! File::isDirectory($this->promptsBaseDir)) {
            $experts['default'] = 'Default codebase navigation expert';

            return $experts;
        }

        // Scan the directory for subdirectories (each representing an expert)
        foreach (File::directories($this->promptsBaseDir) as $directory) {
            $expertName = basename($directory);
            $systemFilePath = $directory.'/system.txt';

            // Only include the expert if it has a system.txt file
            if (File::exists($systemFilePath)) {
                // Read the first line from the system.txt file
                $fileHandle = fopen($systemFilePath, 'r');
                if ($fileHandle) {
                    $firstLine = fgets($fileHandle);
                    fclose($fileHandle);

                    // Clean up the first line and use it as the description
                    $description = trim($firstLine);
                    // If the line starts with "You are a" or similar, keep it as is,
                    // otherwise prepend a default description
                    if (empty($description)) {
                        $description = ucfirst($expertName).' expert';
                    }

                    $experts[$expertName] = $description;
                } else {
                    // Fallback if we can't read the file
                    $experts[$expertName] = ucfirst($expertName).' expert';
                }
            }
        }

        // If no experts were found, at least include 'default'
        if (empty($experts)) {
            $experts['default'] = 'Default codebase navigation expert';
        } elseif (! isset($experts['default'])) {
            // Make sure 'default' is always included at the beginning if it exists
            $defaultExperts = ['default' => 'Default codebase navigation expert'];
            $experts = $defaultExperts + $experts;
        }

        return $experts;
    }
}
