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
        // Use the model specifically configured for expert selection tasks
        $this->model = config('gemini.expert_selector_model');
        // Path to the system prompt specific to expert selection
        $this->systemPromptPath = base_path('prompts/expert-selector/system.txt');

        $this->availableExperts = app(ProjectQuestionService::class)->getAvailableExperts();
    }

    /**
     * Select the most appropriate expert for a question.
     *
     * @param  string  $question  The user's question
     * @param  array|null  $availableExperts  An array of available experts (names => descriptions), defaults to class property if not provided
     * @return string  The name of the selected expert
     *
     * @throws RuntimeException When the Gemini API call fails
     */
    public function selectExpert(string $question, ?array $availableExperts = null): string
    {
        // Use the provided array or fall back to the class property
        $experts = $availableExperts ?? $this->availableExperts;

        try {
            // Prepare a prompt that describes the available experts and asks for the best match
            $prompt = $this->buildPrompt($question, $experts);

            // Make a request to Gemini for expert selection
            $response = Gemini::generativeModel(model: config('gemini.expert_selector_model'))
                ->generateContent($prompt);

            // Parse the response to determine the selected expert
            return $this->parseExpertResponse($response, array_keys($experts));
        } catch (Throwable $e) {
            Log::error('Expert selection failed: '.$e->getMessage());
            // For simplicity, fall back to the default expert
            return 'default';
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

    /**
     * Parse the response from Gemini to determine the selected expert.
     *
     * @param  mixed  $response  The response from Gemini
     * @param  array  $expertNames  An array of available expert names
     * @return string  The name of the selected expert
     *
     * @throws RuntimeException When the response format is invalid
     */
    protected function parseExpertResponse($response, array $expertNames): string
    {
        // Extract text from the response object
        $responseText = is_string($response) ? $response : ($response->text() ?? '');

        try {
            $result = json_decode($responseText, true);

            // Throw an exception if JSON is invalid or structure is wrong to trigger retry
            if (! isset($result['expert']) || ! is_string($result['expert']) || ! in_array($result['expert'], $expertNames)) {
                Log::warning('Invalid response format from Gemini API: '.$responseText);
                throw new RuntimeException('Invalid response format from Gemini API');
            }

            // If everything is okay, return the expert name
            return $result['expert'];
        } catch (\JsonException $e) {
            Log::warning('Failed to parse JSON response: '.$responseText);
            throw new RuntimeException('Failed to parse JSON response from Gemini API');
        }
    }
}
