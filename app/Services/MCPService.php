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
     * @param array $arguments The arguments from the 'tools/call' request ('question', 'state', etc.).
     * @param string $projectPath The root path of the project being queried.
     * @return array The result payload for the JSON-RPC response (e.g., ['content' => [...], '_meta' => [...] ]).
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
        return $this->buildResponsePayload($fullResponseText, $isNewConversation, $stateKey);
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
     *
     * @param string $fullResponseText The full response text from the AI.
     * @param bool $isNewConversation Whether this is a new conversation.
     * @param string $stateKey The state key for the conversation.
     * @return array The formatted response payload.
     */
    protected function buildResponsePayload(string $fullResponseText, bool $isNewConversation, string $stateKey): array
    {
        // Create the TextContent object containing the AI's answer
        $textContent = [
            'type' => 'text',
            'text' => $fullResponseText
        ];

        // Create the main result structure required by MCP
        $responsePayload = [
            // 'content' MUST be an array containing one or more content objects
            'content' => [$textContent],
            'isError' => false // Indicate success
        ];

        // Add state_key to metadata if this is a new conversation
        if ($isNewConversation && $stateKey) {
            if (!isset($responsePayload['_meta'])) {
                $responsePayload['_meta'] = [];
            }
            $responsePayload['_meta']['state_key'] = $stateKey;
            Log::channel('mcp')->debug("Included new state_key '{$stateKey}' in response _meta");
        }

        return $responsePayload;
    }
} 