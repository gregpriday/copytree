<?php

namespace App\Services;

use App\Constants\AIModelTypes; // Add AI Facade
use App\Facades\AI;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use OpenAI\Responses\Chat\CreateResponse;
use RuntimeException;
use Throwable; // Import AIModelTypes if needed elsewhere, or remove if only used for defaults

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
     * The AI provider to use (e.g., 'openai', 'gemini').
     */
    protected string $provider;

    /**
     * The AI model size identifier (e.g., 'small', 'medium', 'large').
     */
    protected string $modelSize;

    /**
     * The path to the directory containing the system prompt.
     */
    protected string $promptsBaseDir;

    /**
     * Create a new ProjectQuestionService instance.
     *
     * @param  string  $provider  The AI provider identifier (e.g., 'openai').
     * @param  string  $modelSize  The AI model size identifier (e.g., 'small').
     */
    public function __construct(string $provider, string $modelSize)
    {
        $this->provider = $provider;
        $this->modelSize = $modelSize;
        $this->promptsBaseDir = base_path('prompts/project-question');
    }

    /**
     * Ask a question about the project using the configured provider/model and return the full response object.
     * Optionally includes conversation history for stateful interactions.
     *
     * @param  string  $projectCopytree  The copytree output of the project
     * @param  string  $question  The user's question about the project
     * @param  array  $history  Optional conversation history for stateful interactions
     * @return CreateResponse The full response object from the AI
     *
     * @throws RuntimeException When the system prompt cannot be found or the API call fails
     */
    public function askQuestion(string $projectCopytree, string $question, array $history = []): CreateResponse
    {
        // Get the actual model name based on the CONFIGURED provider and size
        // Ensure the config path exists and is valid before accessing
        $modelConfigPath = "ai.providers.{$this->provider}.models.{$this->modelSize}";
        if (! config()->has($modelConfigPath)) {
            throw new RuntimeException("Model configuration not found for provider '{$this->provider}' and size '{$this->modelSize}' at path '{$modelConfigPath}'.");
        }
        $modelName = config($modelConfigPath); // Use configured provider/size

        // Load the single system prompt
        $systemPromptPath = $this->promptsBaseDir.'/system.txt'; // Path to the new single prompt
        if (! File::exists($systemPromptPath)) {
            throw new RuntimeException("System prompt not found at {$systemPromptPath}.");
        }
        $systemPrompt = File::get($systemPromptPath);

        // --- Prepare Messages for AI API ---
        $messages = [];

        // Add system message
        $messages[] = [
            'role' => 'system',
            'content' => $systemPrompt,
        ];

        // Add the first user message containing ONLY the project code
        if (! empty($projectCopytree)) {
            $messages[] = [
                'role' => 'user',
                'content' => $projectCopytree,
            ];
        }

        // Add history messages
        if (! empty($history)) {
            foreach ($history as $histItem) {
                // Process text to remove XML tags if present
                $messageText = $histItem['content'];
                $messageText = preg_replace('/<ct:(summary|truncated)>(.*?)<\/ct:\1>/s', '$2', $messageText);

                $messages[] = [
                    'role' => $histItem['role'],
                    'content' => $messageText,
                ];
            }
        }

        // Add the final user message containing ONLY the current question
        $messages[] = [
            'role' => 'user',
            'content' => $question,
        ];

        // Configure generation parameters (NO 'stream_options')
        $parameters = [
            'model' => $modelName, // Use the resolved model name
            'messages' => $messages,
            'max_tokens' => 8192, // Or your preferred max
            // Add other parameters like temperature if needed
        ];

        try {
            // Make the NON-STREAMING API call using the CONFIGURED provider
            $response = AI::driver($this->provider)->chat()->create($parameters); // Use $this->provider

            return $response; // Return the complete response object
        } catch (Throwable $e) {
            // Log the error
            Log::error("AI API call failed in askQuestion: {$e->getMessage()}", [
                'provider' => $this->provider, // Log configured provider
                'model' => $modelName,       // Log resolved model name
                'exception' => get_class($e),
                // Avoid logging full messages/context in production logs if sensitive
            ]);
            // Re-throw the exception so the command can handle it
            throw new RuntimeException("AI API call failed: {$e->getMessage()}", 0, $e);
        }
    }
}
