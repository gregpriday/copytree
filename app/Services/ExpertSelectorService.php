<?php

namespace App\Services;

use Gemini\Data\Content;
use Gemini\Data\GenerationConfig;
use Gemini\Data\Schema;
use Gemini\Enums\DataType;
use Gemini\Enums\ResponseMimeType;
use Gemini\Laravel\Facades\Gemini;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;
use ValueError;

class ExpertSelectorService
{
    const DEFAULT_EXPERT = 'default';

    const MAX_RETRIES = 3;

    const RETRY_DELAY_MS = 500;

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
     * Select the best expert for a given question using Laravel's retry helper.
     *
     * @param  string  $question  The user's question about the project
     * @return string The name of the selected expert
     */
    public function selectExpert(string $question): string
    {
        $systemPrompt = File::get($this->systemPromptPath);

        // Prepare input for the AI
        $prompt = $this->buildPrompt($question, $this->availableExperts);

        // Get the list of expert names for the schema enum
        $expertNames = array_keys($this->availableExperts);

        // Configure the generation parameters with an enum-constrained schema
        $generationConfig = new GenerationConfig(
            maxOutputTokens: 512,
            temperature: 0.2,
            topP: 0.95,
            topK: 40,
            responseMimeType: ResponseMimeType::APPLICATION_JSON,
            responseSchema: new Schema(
                type: DataType::OBJECT,
                properties: [
                    'expert' => new Schema(
                        type: DataType::STRING,
                        enum: $expertNames
                    ),
                ]
            )
        );

        try {
            // Use Laravel's retry helper
            $selectedExpert = retry(self::MAX_RETRIES, function () use ($systemPrompt, $generationConfig, $prompt) {
                // Generate content using Gemini
                $response = Gemini::generativeModel(model: $this->model)
                    ->withSystemInstruction(Content::parse($systemPrompt))
                    ->withGenerationConfig($generationConfig)
                    ->generateContent($prompt);

                $content = $response->text() ?? '';

                // Throw an exception if content is empty to trigger retry
                if (empty($content)) {
                    Log::warning('Empty content received from Gemini API');
                    throw new RuntimeException('Empty content received from Gemini API');
                }

                $result = json_decode($content, true);

                // Throw an exception if JSON is invalid or structure is wrong to trigger retry
                if (! isset($result['expert']) || ! is_string($result['expert']) || ! array_key_exists($result['expert'], $this->availableExperts)) {
                    Log::warning('Invalid response format from Gemini API: '.$content);
                    throw new RuntimeException('Invalid response format from Gemini API');
                }

                // If everything is okay, return the expert name
                return $result['expert'];
            }, self::RETRY_DELAY_MS); // Delay between retries in milliseconds

            return $selectedExpert;
        } catch (ValueError $e) {
            // Handle final ValueError after all retries (often due to content filtering)
            Log::error('Expert selection failed after '.self::MAX_RETRIES.' attempts due to ValueError: '.$e->getMessage());

            return self::DEFAULT_EXPERT;
        } catch (Throwable $e) {
            // Catch any other exception after retries
            Log::error('Expert selection failed after '.self::MAX_RETRIES.' attempts: '.$e->getMessage());

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
