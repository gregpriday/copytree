<?php

namespace App\Services;

use Illuminate\Contracts\Config\Repository as ConfigContract;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;
use RuntimeException;

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
     */
    public function __construct(ConfigContract $config, ConversationStateService $stateService)
    {
        $this->config = $config;
        $this->stateService = $stateService;
    }

    /**
     * Handles a 'project_ask' tool call.
     *
     * @param  array  $arguments  The arguments from the 'tools/call' request.
     * @param  string  $projectPath  The root path of the project being queried.
     * @return array An array suitable for constructing CallToolResult:
     *               ['content' => [['type' => 'text', 'text' => ...]], 'isError' => bool, '_meta' => ['state_key' => ...]?]
     *
     * @throws InvalidArgumentException For invalid arguments.
     * @throws RuntimeException For context gathering failures, AI errors, etc.
     */
    public function handleProjectAsk(array $arguments, string $projectPath): array
    {
        // Validate required arguments
        $question = $arguments['question'] ?? null;
        if (! $question) {
            Log::channel('mcp')->error("Missing 'question' argument in project_ask request");
            throw new InvalidArgumentException("'question' is required.");
        }

        // Extract optional arguments
        $stateKeyInput = $arguments['state'] ?? null; // Get the raw input
        $providerOption = $arguments['ask-provider'] ?? null;
        $modelSizeOption = $arguments['ask-model-size'] ?? null;

        // --- Add this validation block ---
        if ($stateKeyInput !== null && ! is_string($stateKeyInput)) {
            $invalidType = gettype($stateKeyInput);
            Log::channel('mcp')->error("Invalid type received for 'state' argument: expected string or null, got {$invalidType}");
            throw new \InvalidArgumentException("Invalid type for 'state' argument: expected string or null, received {$invalidType}.");
        }
        // --- End of addition ---

        // Determine AI provider and model size
        $provider = $providerOption ?: $this->config->get('ai.ask_defaults.provider', 'openai');
        $modelSize = $modelSizeOption ?: $this->config->get('ai.ask_defaults.model_size', 'small');
        Log::channel('mcp')->debug("Using Provider='{$provider}', ModelSize='{$modelSize}' for project_ask.");

        // Create question service with determined provider and model
        $questionService = resolve(ProjectQuestionService::class, [
            'provider' => $provider,
            'modelSize' => $modelSize,
        ]);

        // --- Start: Improved State Key Handling ---
        $stateKey = null; // Default to null (new conversation)
        $history = [];
        $isNewConversation = true;

        // Check if the provided state key input is a non-empty string
        if (is_string($stateKeyInput) && $stateKeyInput !== '') {
            $stateKey = $stateKeyInput; // Use the valid string key
            Log::channel('mcp')->info("Attempting to continue conversation with state key: {$stateKey}");
            $history = $this->stateService->loadHistory($stateKey); // Load history ONLY if key is a valid string
            if (! empty($history)) {
                Log::channel('mcp')->debug('Loaded '.count($history)." messages for state key: {$stateKey}");
                $isNewConversation = false;
            } else {
                // If history is empty for a valid key, it might be expired or invalid
                Log::channel('mcp')->warning("State key '{$stateKey}' provided, but no history found. Starting fresh.");
                // Keep stateKey as is, but signal it's effectively a new conversation start
                $stateKey = $this->stateService->generateStateKey(); // Generate a new key for this session
                Log::channel('mcp')->info("Generated new state key for this session: {$stateKey}");
                $isNewConversation = true; // Treat as new
            }
        } elseif ($stateKeyInput !== null) { // This block now primarily catches empty strings if schema allowed them, or handles unexpected edge cases.
            $receivedType = gettype($stateKeyInput); // Get type for logging
            // Log a warning if a non-null, but also non-valid-string value was provided (e.g., empty string)
            Log::channel('mcp')->warning("Invalid or empty value provided for 'state' argument (type: {$receivedType}). Ignoring invalid state and starting a new conversation.");
            // Fall through to generate a new key below
        }

        // Generate a new state key if no valid one was provided or found
        if ($isNewConversation && $stateKey === null) {
            $stateKey = $this->stateService->generateStateKey();
            Log::channel('mcp')->info("Starting new conversation with state key: {$stateKey}");
        }
        // --- End: Improved State Key Handling ---

        // Gather project context
        $copytreeOutput = $this->gatherProjectContext($projectPath);

        // Process the question with the AI service
        $processedData = $this->processQuestionWithAI(
            $questionService,
            $copytreeOutput,
            $question,
            $history,
            $stateKey,
            $provider,
            $modelSize
        );

        // Construct response payload using the structured data
        return $this->buildResponsePayload(
            $processedData['fullResponseText'],
            $stateKey,
            $processedData['inputTokens'],
            $processedData['outputTokens'],
            $processedData['cachedInputTokens'],
            $processedData['totalCost'],
            $processedData['pricingFound'],
            $processedData['pricesAvailable']
        );
    }

    /**
     * Gathers the project context using the 'copy' command.
     *
     * @param  string  $projectPath  The root path of the project to analyze.
     * @return string The generated copytree output.
     *
     * @throws RuntimeException If context gathering fails.
     */
    protected function gatherProjectContext(string $projectPath): string
    {
        Log::channel('mcp')->debug("Gathering project context using 'copy' command...");
        Log::channel('mcp')->debug("Using path for 'copy' command: '".$projectPath."'");

        try {
            $copyOptions = [
                'path' => $projectPath,
                '--display' => true,
                '--no-interaction' => true,
            ];
            Log::channel('mcp')->debug("Options passed to Artisan::call('copy'): ".json_encode($copyOptions));

            Artisan::call('copy', $copyOptions);
            $copytreeOutput = Artisan::output();

            if (empty(trim($copytreeOutput))) {
                Log::channel('mcp')->error("'copy' command returned empty output when gathering context.");
                throw new RuntimeException("Failed to gather project context: 'copy' command returned empty output.");
            }
            Log::channel('mcp')->debug('Generated copytree output length: '.strlen($copytreeOutput));

            return $copytreeOutput;
        } catch (\Exception $e) {
            Log::channel('mcp')->error("Failed to run 'copy' command to get context: ".$e->getMessage());
            throw new RuntimeException('Failed to gather project context via copy command: '.$e->getMessage(), 0, $e);
        }
    }

    /**
     * Processes the question with the AI service, calculates token usage and cost.
     *
     * @param  ProjectQuestionService  $questionService  The service for AI interactions.
     * @param  string  $copytreeOutput  The project context.
     * @param  string  $question  The user's question.
     * @param  array  $history  Conversation history.
     * @param  string  $stateKey  The state key for the conversation.
     * @param  string  $provider  The AI provider used.
     * @param  string  $modelSize  The AI model size used.
     * @return array An array containing response text, token counts, cost, and pricing status.
     *
     * @throws RuntimeException If the AI request fails.
     */
    protected function processQuestionWithAI(
        ProjectQuestionService $questionService,
        string $copytreeOutput,
        string $question,
        array $history,
        string $stateKey, // Ensure stateKey is always a string here
        string $provider,
        string $modelSize
    ): array {
        try {
            $apiResponse = $questionService->askQuestion($copytreeOutput, $question, $history);
            $fullResponseText = $apiResponse->choices[0]->message->content ?? '';

            // Extract token usage
            $usage = $apiResponse->usage ?? null;
            $inputTokens = 0;
            $outputTokens = 0;
            $cachedInputTokens = 0;

            if ($usage) {
                $inputTokens = $usage->promptTokens ?? 0;
                $outputTokens = $usage->completionTokens ?? 0;
                // Check for cached token details (adjust based on actual API response structure if needed)
                $promptDetails = $usage->promptTokensDetails ?? null;
                $cachedInputTokens = $promptDetails->cachedTokens ?? 0;
            } else {
                Log::channel('mcp')->warning('Token usage data missing from API response.', ['response_id' => $apiResponse->id ?? 'N/A']);
            }

            // Calculate cost
            $totalCost = 0.0;
            $pricingConfigKey = "ai.providers.{$provider}.pricing.{$modelSize}";
            $pricingFound = $this->config->has($pricingConfigKey);
            $pricesAvailable = false;

            if ($pricingFound) {
                $pricing = $this->config->get($pricingConfigKey);
                $inputPrice = $pricing['input'] ?? null;
                $outputPrice = $pricing['output'] ?? null;
                $cachedInputPrice = $pricing['cached_input'] ?? $inputPrice; // Fallback

                $pricesAvailable = is_numeric($inputPrice) && is_numeric($outputPrice) && is_numeric($cachedInputPrice);

                if ($pricesAvailable) {
                    $nonCachedInputTokens = $inputTokens - $cachedInputTokens;
                    if ($nonCachedInputTokens > 0) {
                        $totalCost += ($nonCachedInputTokens / 1000000) * $inputPrice;
                    }
                    if ($cachedInputTokens > 0 && $cachedInputPrice > 0) {
                        $totalCost += ($cachedInputTokens / 1000000) * $cachedInputPrice;
                    }
                    if ($outputTokens > 0) {
                        $totalCost += ($outputTokens / 1000000) * $outputPrice;
                    }
                } else {
                    Log::channel('mcp')->warning("One or more pricing values missing/invalid for {$provider}:{$modelSize}. Cost not calculated.");
                    $pricingFound = false; // Mark as not found if prices invalid
                }
            } else {
                Log::channel('mcp')->warning("Pricing configuration key '{$pricingConfigKey}' not found. Cost not calculated.");
            }

            // Save conversation history
            $this->stateService->saveMessage($stateKey, 'user', $question);
            $this->stateService->saveMessage($stateKey, 'assistant', $fullResponseText);

            // Return structured data
            return [
                'fullResponseText' => $fullResponseText,
                'inputTokens' => $inputTokens,
                'outputTokens' => $outputTokens,
                'cachedInputTokens' => $cachedInputTokens,
                'totalCost' => $totalCost,
                'pricingFound' => $pricingFound,
                'pricesAvailable' => $pricesAvailable,
            ];
        } catch (\Exception $e) {
            Log::channel('mcp')->error("Error during question processing: {$e->getMessage()}");
            throw new RuntimeException("Error answering question: {$e->getMessage()}", 0, $e);
        }
    }

    /**
     * Builds the response payload for the JSON-RPC response.
     * Includes token usage, cost, state_key, and follow-up hints.
     *
     * @param  string  $fullResponseText  The full response text from the AI.
     * @param  string|null  $stateKey  The state key for the conversation (null if stateless).
     * @param  bool  $pricingFound  Indicates if pricing config key was found.
     * @param  bool  $pricesAvailable  Indicates if valid prices were found in config.
     * @return array The formatted response payload.
     */
    protected function buildResponsePayload(
        string $fullResponseText,
        ?string $stateKey,
        int $inputTokens,
        int $outputTokens,
        int $cachedInputTokens,
        float $totalCost,
        bool $pricingFound,
        bool $pricesAvailable
    ): array {
        $tokenInfoString = '';
        if ($inputTokens > 0 || $outputTokens > 0) {
            $cachedPercentage = $inputTokens > 0 ? round(($cachedInputTokens / $inputTokens) * 100, 1) : 0;
            $costString = '';
            if ($totalCost > 0) {
                $formattedCost = number_format($totalCost, 6);
                $costString = sprintf(', Cost: $%s', $formattedCost);
            } elseif ($pricingFound && $pricesAvailable && $totalCost == 0) {
                $costString = ', Cost: $0.000000'; // Explicitly show $0 cost if pricing was found and valid
            } else {
                $costString = ' (Cost N/A)'; // Indicate if cost couldn't be calculated
            }

            $tokenInfoString = sprintf(
                'Tokens: %s input (%s%% cached), %s output%s',
                number_format($inputTokens),
                $cachedPercentage,
                number_format($outputTokens),
                $costString
            );
            Log::channel('mcp')->debug('Formatted token string: '.$tokenInfoString);
        } else {
            Log::channel('mcp')->debug('No token usage information available to display.');
            // Optional: $tokenInfoString = "\n\nToken Usage: Not Available";
        }

        $followUpHintText = '';
        if ($stateKey) {
            $followUpArgsJson = json_encode(['question' => '{your_follow_up_question}', 'state' => $stateKey]);
            $followUpHintText = sprintf(
                'Ask follow-up questions with: %s',
                $followUpArgsJson
            );
            Log::channel('mcp')->debug('Formatted follow-up hint: '.$followUpHintText);
        }

        // Append token info AND follow-up hint to the main response text
        $finalTextContent = $fullResponseText."\n\n---\n".$tokenInfoString."\n".$followUpHintText;

        // Create the TextContent object
        $textContent = [
            'type' => 'text',
            'text' => $finalTextContent,
        ];

        // Create the main result structure
        $responsePayload = [
            'content' => [$textContent],
            'isError' => false,
        ];

        // Include metadata if a stateKey exists
        if ($stateKey) {
            $responsePayload['_meta'] = [
                'state_key' => $stateKey,
                // Include structured token info in _meta
                'token_usage' => [
                    'input_tokens' => $inputTokens,
                    'output_tokens' => $outputTokens,
                    'cached_input_tokens' => $cachedInputTokens,
                    'total_cost' => $totalCost,
                    'cost_calculated' => ($pricingFound && $pricesAvailable), // Indicate if cost calc was possible
                ],
                'follow_up_hint' => [ // Keep existing structured hint
                    'arguments' => [
                        'question' => '{your_follow_up_question}',
                        'state' => $stateKey,
                    ],
                ],
            ];
            Log::channel('mcp')->debug('Included state_key, token_usage, and follow_up_hint in response _meta');
        } else {
            // Include token usage even if stateless, if available
            if ($inputTokens > 0 || $outputTokens > 0) {
                $responsePayload['_meta'] = [
                    'token_usage' => [
                        'input_tokens' => $inputTokens,
                        'output_tokens' => $outputTokens,
                        'cached_input_tokens' => $cachedInputTokens,
                        'total_cost' => $totalCost,
                        'cost_calculated' => ($pricingFound && $pricesAvailable),
                    ],
                ];
                Log::channel('mcp')->debug('Included token_usage in response _meta for stateless request.');
            } else {
                Log::channel('mcp')->debug('No state_key provided and no token usage; _meta field omitted.');
            }
        }

        return $responsePayload;
    }
}
