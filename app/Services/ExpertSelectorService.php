<?php

namespace App\Services;

use App\Facades\AI;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

class ExpertSelectorService
{
    const DEFAULT_EXPERT = 'default';
    const DEFAULT_PROVIDER = 'llama';
    const DEFAULT_MODEL = 'medium';

    const MAX_RETRIES = 3;

    const RETRY_DELAY_MS = 500;

    /**
     * The AI model to use for selecting experts.
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
        $this->model = AI::models('llama')['medium']; // Always use a flash model for selection
        // Path to the system prompt specific to expert selection
        $this->systemPromptPath = base_path('prompts/expert-selector/system.txt');

        $this->availableExperts = app(ProjectQuestionService::class)->getAvailableExperts();
    }

    /**
     * Select the most appropriate expert for a question.
     *
     * @param  string  $question  The user's question
     * @param  array|null  $availableExperts  An array of available experts (names => descriptions), defaults to class property if not provided
     * @return string The name of the selected expert
     *
     * @throws RuntimeException When the AI API call fails
     */
    public function selectExpert(string $question, ?array $availableExperts = null): string
    {
        // For backward compatibility, call selectConfig and return just the expert
        return $this->selectConfig($question, $availableExperts)['expert'];
    }

    /**
     * Select the most appropriate expert, provider, and model for a question.
     *
     * @param  string  $question  The user's question
     * @param  array|null  $availableExperts  An array of available experts (names => descriptions), defaults to class property if not provided
     * @return array The configuration with expert, provider, and model keys
     *
     * @throws RuntimeException When the AI API call fails
     */
    public function selectConfig(string $question, ?array $availableExperts = null): array
    {
        // Use the provided array or fall back to the class property
        $experts = $availableExperts ?? $this->availableExperts;

        try {
            // Prepare a prompt that describes the available experts and asks for the best match
            $prompt = $this->buildPrompt($question, $experts);

            // Make a request to AI for expert selection
            $response = AI::driver('llama')->chat()
                ->create([
                    'model' => $this->model,
                    'response_format' => [
                        'type' => "json_object",
                    ],
                    'messages' => [
                        [
                            'role' => 'system',
                            'content' => File::get($this->systemPromptPath),
                        ],
                        [
                            'role' => 'user',
                            'content' => $prompt,
                        ],
                    ],
                ]);

            // Parse the response to determine the selected expert, provider, and model
            return $this->parseConfigResponse($response, array_keys($experts));
        } catch (Throwable $e) {
            Log::error('Expert selection failed: '.$e->getMessage());

            // For simplicity, fall back to the default configuration
            return [
                'expert' => self::DEFAULT_EXPERT,
                'provider' => self::DEFAULT_PROVIDER,
                'model' => self::DEFAULT_MODEL,
            ];
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

        $models = File::get(base_path('prompts/expert-selector/models.txt'));

        // Prepare the replacements
        $replacements = [
            '{{models}}' => $models,
            '{{question}}' => $question,
            '{{experts}}' => json_encode($availableExperts, JSON_PRETTY_PRINT),
        ];

        // Replace placeholders in the template
        return str_replace(array_keys($replacements), array_values($replacements), $template);
    }

    /**
     * Parse the response from the AI to determine the selected expert.
     *
     * @param  mixed  $response  The response from the AI
     * @param  array  $expertNames  An array of available expert names
     * @return string The name of the selected expert
     *
     * @throws RuntimeException When the response format is invalid
     */
    protected function parseExpertResponse($response, array $expertNames): string
    {
        // Extract text from the response object
        $responseText = $response->choices[0]->message->content ?? '';

        try {
            $result = json_decode($responseText, true);

            // Throw an exception if JSON is invalid or structure is wrong to trigger retry
            if (! isset($result['expert']) || ! is_string($result['expert']) || ! in_array($result['expert'], $expertNames)) {
                Log::warning('Invalid response format from AI API: '.$responseText);
                throw new RuntimeException('Invalid response format from AI API');
            }

            // If everything is okay, return the expert name
            return $result['expert'];
        } catch (\JsonException $e) {
            Log::warning('Failed to parse JSON response: '.$responseText);
            throw new RuntimeException('Failed to parse JSON response from AI API');
        }
    }

    /**
     * Parse the response from the AI to determine the selected expert, provider, and model.
     *
     * @param  mixed  $response  The response from the AI
     * @param  array  $expertNames  An array of available expert names
     * @return array The configuration with expert, provider, and model keys
     *
     * @throws RuntimeException When the response format is invalid
     */
    protected function parseConfigResponse($response, array $expertNames): array
    {
        // Extract text from the response object
        $responseText = $response->choices[0]->message->content ?? '';

        try {
            $result = json_decode($responseText, true);

            // Check if the response contains at least the expert field
            if (! isset($result['expert']) || ! is_string($result['expert']) || ! in_array($result['expert'], $expertNames)) {
                Log::warning('Invalid response format from AI API: '.$responseText);
                throw new RuntimeException('Invalid response format from AI API');
            }

            // Parse provider and model if available, otherwise use defaults
            $provider = $result['provider'] ?? self::DEFAULT_PROVIDER;
            $model = $result['model'] ?? self::DEFAULT_MODEL;

            return [
                'expert' => $result['expert'],
                'provider' => $provider,
                'model' => $model,
            ];
        } catch (\JsonException $e) {
            Log::warning('Failed to parse JSON response: '.$responseText);
            throw new RuntimeException('Failed to parse JSON response from AI API');
        }
    }
}
