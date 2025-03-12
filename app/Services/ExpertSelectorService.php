<?php

namespace App\Services;

use Gemini\Data\Content;
use Gemini\Data\GenerationConfig;
use Gemini\Data\Schema;
use Gemini\Enums\DataType;
use Gemini\Enums\ResponseMimeType;
use Gemini\Laravel\Facades\Gemini;
use Illuminate\Support\Facades\File;

class ExpertSelectorService
{
    const DEFAULT_EXPERT = 'default';

    /**
     * The Gemini model to use for selecting experts.
     */
    protected string $model;

    /**
     * The path to the system prompt for expert selection.
     */
    protected string $systemPromptPath;

    /**
     * @var array|string[]
     */
    private array $availableExperts;

    /**
     * Create a new ExpertSelectorService instance.
     */
    public function __construct()
    {
        // Use the standard Gemini model (it doesn't need the thinking model for this task)
        $this->model = config('gemini.model');
        // Path to the system prompt specific to expert selection
        $this->systemPromptPath = base_path('prompts/expert-selector/system.txt');

        $this->availableExperts = app(ProjectQuestionService::class)->getAvailableExperts();
    }

    /**
     * Select the best expert for a given question.
     *
     * @param  string  $question  The user's question about the project
     * @param  array  $availableExperts  Associative array of expert names and descriptions
     * @param  string  $defaultExpert  The default expert to use if selection fails
     * @return string The name of the selected expert
     */
    public function selectExpert(string $question): string
    {
        $systemPrompt = File::get($this->systemPromptPath);

        // Prepare input for the AI
        $prompt = $this->buildPrompt($question, $this->availableExperts);

        // Configure the generation parameters
        $generationConfig = new GenerationConfig(
            maxOutputTokens: 512,
            temperature: 0.2,
            topP: 0.95,
            topK: 40,
            responseMimeType: ResponseMimeType::APPLICATION_JSON,
            responseSchema: new Schema(
                type: DataType::OBJECT,
                properties: [
                    'expert' => new Schema(type: DataType::STRING),
                ]
            )
        );

        try {
            // Generate content using Gemini
            $response = Gemini::generativeModel(model: $this->model)
                ->withSystemInstruction(Content::parse($systemPrompt))
                ->withGenerationConfig($generationConfig)
                ->generateContent($prompt);

            $content = $response->text() ?? '';

            if (empty($content)) {
                return self::DEFAULT_EXPERT;
            }

            $result = json_decode($content, true);

            // Check if we received valid JSON with the expected structure
            if (isset($result['expert']) && is_string($result['expert']) && array_key_exists($result['expert'], $this->availableExperts)) {
                return $result['expert'];
            }

            return self::DEFAULT_EXPERT;
        } catch (\Exception $e) {
            \Log::error('Expert selection failed: '.$e->getMessage());

            return self::DEFAULT_EXPERT;
        }
    }

    /**
     * Build the prompt for the AI to select an expert.
     *
     * @param  string  $question  The user's question
     * @param  array  $availableExperts  Associative array of expert names and descriptions
     * @return string The formatted prompt
     */
    protected function buildPrompt(string $question, array $availableExperts): string
    {
        // Get the template path
        $templatePath = base_path('prompts/expert-selector/prompt.txt');

        // Load the template
        $template = File::get($templatePath);

        // Prepare the replacements
        $replacements = [
            '{{question}}' => $question,
            '{{experts}}' => json_encode($availableExperts, JSON_PRETTY_PRINT),
        ];

        // Replace placeholders in the template
        return str_replace(array_keys($replacements), array_values($replacements), $template);
    }
}
