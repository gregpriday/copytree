<?php

namespace App\Services;

use Illuminate\Contracts\Config\Repository as ConfigContract;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use InvalidArgumentException;

class MCPService
{
    /**
     * The configuration repository instance.
     */
    protected ConfigContract $config;

    /**
     * The conversation state service instance.
     */
    protected ConversationStateService $stateService;

    /**
     * Create a new MCPService instance.
     *
     * @param ConfigContract $config
     * @param ConversationStateService $stateService
     */
    public function __construct(ConfigContract $config, ConversationStateService $stateService)
    {
        $this->config = $config;
        $this->stateService = $stateService;
    }

    /**
     * Handles a 'project_ask' tool call.
     *
     * @param array $arguments The arguments from the 'tools/call' request.
     * @param string $projectPath The root path of the project being queried.
     * @return array An array suitable for constructing CallToolResult:
     * ['content' => [['type' => 'text', 'text' => ...]], 'isError' => bool, '_meta' => ['state_key' => ...]?]
     * @throws InvalidArgumentException For invalid arguments.
     * @throws RuntimeException For context gathering failures, AI errors, etc.
     */
    public function handleProjectAsk(array $arguments, string $projectPath): array
    {
        // Validate required arguments
        $question = $arguments['question'] ?? null;
        if (!$question) {
            Log::channel('mcp')->error("Missing 'question' argument in project_ask request");
            throw new InvalidArgumentException("'question' is required.");
        }

        // Extract optional arguments
        $stateKey = $arguments['state'] ?? null;
        $providerOption = $arguments['ask-provider'] ?? null;
        $modelSizeOption = $arguments['ask-model-size'] ?? null;

        // Determine AI provider and model size
        $provider = $providerOption ?: $this->config->get('ai.ask_defaults.provider', 'openai');
        $modelSize = $modelSizeOption ?: $this->config->get('ai.ask_defaults.model_size', 'small');
        Log::channel('mcp')->debug("Using Provider='{$provider}', ModelSize='{$modelSize}' for project_ask.");

        // Create question service with determined provider and model
        $questionService = resolve(ProjectQuestionService::class, [
            'provider' => $provider,
            'modelSize' => $modelSize,
        ]);

        // Handle conversation state
        $history = [];
        $isNewConversation = false;
        if ($stateKey) {
            Log::channel('mcp')->info("Continuing conversation with state key: {$stateKey}");
            $history = $this->stateService->loadHistory($stateKey);
            if (empty($history)) {
                Log::channel('mcp')->warning("State key '{$stateKey}' provided, but no history found. Starting fresh.");
            }
        } else {
            $stateKey = $this->stateService->generateStateKey();
            Log::channel('mcp')->info("Starting new conversation with state key: {$stateKey}");
            $isNewConversation = true;
        }

        // Gather project context
        $copytreeOutput = $this->gatherProjectContext($projectPath);

        // Process the question with the AI service
        $fullResponseText = $this->processQuestionWithAI($questionService, $copytreeOutput, $question, $history, $stateKey);

        // Construct response payload
        return $this->buildResponsePayload($fullResponseText, $stateKey);
    }

    /**
     * Gathers the project context using the 'copy' command.
     *
     * @param string $projectPath The root path of the project to analyze.
     * @return string The generated copytree output.
     * @throws RuntimeException If context gathering fails.
     */
    protected function gatherProjectContext(string $projectPath): string
    {
        Log::channel('mcp')->debug("Gathering project context using 'copy' command...");
        Log::channel('mcp')->debug("Using path for 'copy' command: '" . $projectPath . "'");

        try {
            $copyOptions = [
                'path' => $projectPath,
                '--display' => true,
                '--no-interaction' => true,
            ];
            Log::channel('mcp')->debug("Options passed to Artisan::call('copy'): " . json_encode($copyOptions));

            Artisan::call('copy', $copyOptions);
            $copytreeOutput = Artisan::output();

            if (empty(trim($copytreeOutput))) {
                Log::channel('mcp')->error("'copy' command returned empty output when gathering context.");
                throw new RuntimeException("Failed to gather project context: 'copy' command returned empty output.");
            }
            Log::channel('mcp')->debug("Generated copytree output length: " . strlen($copytreeOutput));

            return $copytreeOutput;
        } catch (\Exception $e) {
            Log::channel('mcp')->error("Failed to run 'copy' command to get context: " . $e->getMessage());
            throw new RuntimeException("Failed to gather project context via copy command: " . $e->getMessage(), 0, $e);
        }
    }

    /**
     * Processes the question with the AI service.
     *
     * @param ProjectQuestionService $questionService The service for AI interactions.
     * @param string $copytreeOutput The project context.
     * @param string $question The user's question.
     * @param array $history Conversation history.
     * @param string $stateKey The state key for the conversation.
     * @return string The full response text from the AI.
     * @throws RuntimeException If the AI request fails.
     */
    protected function processQuestionWithAI(
        ProjectQuestionService $questionService,
        string $copytreeOutput,
        string $question,
        array $history,
        string $stateKey
    ): string {
        try {
            $apiResponse = $questionService->askQuestion($copytreeOutput, $question, $history);
            $fullResponseText = $apiResponse->choices[0]->message->content ?? '';

            // Save conversation history
            $this->stateService->saveMessage($stateKey, 'user', $question);
            $this->stateService->saveMessage($stateKey, 'assistant', $fullResponseText);

            return $fullResponseText;
        } catch (\Exception $e) {
            Log::channel('mcp')->error("Error during question processing: {$e->getMessage()}");
            throw new RuntimeException("Error answering question: {$e->getMessage()}", 0, $e);
        }
    }

    /**
     * Builds the response payload for the JSON-RPC response.
     * Always includes the state_key and a follow-up hint in _meta if a stateKey exists.
     * Also appends a follow-up hint to the text content.
     *
     * @param string $fullResponseText The full response text from the AI.
     * @param string|null $stateKey The state key for the conversation (null if stateless).
     * @return array The formatted response payload.
     */
    protected function buildResponsePayload(string $fullResponseText, ?string $stateKey): array
    {
        $finalTextContent = $fullResponseText; // Start with the original AI response

        // Append the follow-up hint to the text content if a state key exists
        if ($stateKey) {
            $followUpHintText = sprintf(
                "\n\n---\nAsk follow-up questions with: %s",
                json_encode([
                    'question' => '{your_follow_up_question}',
                    'state' => $stateKey,
                ])
            );
            $finalTextContent .= $followUpHintText; // Append the hint
            Log::channel('mcp')->debug("Appended follow-up hint to text content.");
        }

        // Create the TextContent object using the potentially modified text
        $textContent = [
            'type' => 'text',
            'text' => $finalTextContent // Use the text including the hint
        ];

        // Create the main result structure required by MCP
        $responsePayload = [
            'content' => [$textContent], // Use the content object with the appended hint
            'isError' => false
        ];

        // Always include the state_key and follow-up hint arguments in metadata if a stateKey exists
        if ($stateKey) {
            $responsePayload['_meta'] = [
                'state_key' => $stateKey,
                'follow_up_hint' => [ // Keep the structured hint in _meta
                    'arguments' => [
                        'question' => '{your_follow_up_question}',
                        'state' => $stateKey
                    ]
                ]
            ];
            Log::channel('mcp')->debug("Included state_key '{$stateKey}' and follow_up_hint in response _meta");
        } else {
            Log::channel('mcp')->debug("No state_key provided; _meta field omitted.");
        }

        return $responsePayload;
    }
}
