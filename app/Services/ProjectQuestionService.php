<?php

namespace App\Services;

use Gemini\Data\Content;
use Gemini\Data\GenerationConfig;
use Gemini\Laravel\Facades\Gemini;
use Illuminate\Support\Facades\File;
use RuntimeException;

class ProjectQuestionService
{
    /**
     * The Gemini model to use, defaulting to the thinking model.
     */
    protected string $model;

    /**
     * Create a new ProjectQuestionService instance.
     */
    public function __construct()
    {
        // Use the Gemini thinking model defined in config
        $this->model = config('gemini.model_thinking');
    }

    /**
     * Ask a question about the project.
     *
     * @param  string  $projectCopytree  The copytree output of the project
     * @param  string  $question  The user's question about the project
     * @return string The response from Gemini
     *
     * @throws RuntimeException When the system prompt cannot be found or the API call fails
     */
    public function askQuestion(string $projectCopytree, string $question): string
    {
        // Load the system prompt from the prompts directory
        $systemPromptPath = base_path('prompts/project-question/system.txt');
        if (! File::exists($systemPromptPath)) {
            throw new RuntimeException('System prompt for project questioning not found.');
        }
        $systemPrompt = File::get($systemPromptPath);

        // Build the combined prompt with the project copytree and the user's question
        $prompt = "Here is the project structure and files:\n\n".$projectCopytree."\n\nUser question: ".$question;

        // Configure the generation parameters
        $generationConfig = new GenerationConfig(
            maxOutputTokens: 4096,
            temperature: 0.2,
            topP: 0.95,
            topK: 40
        );

        try {
            // Generate content using Gemini thinking model
            $response = Gemini::generativeModel(model: $this->model)
                ->withSystemInstruction(Content::parse($systemPrompt))
                ->withGenerationConfig($generationConfig)
                ->generateContent($prompt);
        } catch (\Exception $e) {
            throw new RuntimeException('Gemini API call failed: '.$e->getMessage());
        }

        // Retrieve the response text
        $content = $response->text() ?? '';
        if (empty($content)) {
            throw new RuntimeException('No response returned from Gemini.');
        }

        return $content;
    }
}
