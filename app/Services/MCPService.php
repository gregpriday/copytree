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
        $streamRequested = isset($arguments['stream']) && filter_var($arguments['stream'], FILTER_VALIDATE_BOOLEAN);

        // --- Add this validation block ---
        if ($stateKeyInput !== null && ! is_string($stateKeyInput)) {
            $invalidType = gettype($stateKeyInput);
            Log::channel('mcp')->error("Invalid type received for 'state' argument: expected string or null, got {$invalidType}");
            throw new \InvalidArgumentException("Invalid type for 'state' argument: expected string or null, received {$invalidType}.");
        }
        // --- End of addition ---

        // Determine AI provider and model size
        $providerName = $providerOption ?: $this->config->get('ai.ask_defaults.provider', 'openai');
        $modelSize = $modelSizeOption ?: $this->config->get('ai.ask_defaults.model_size', 'small');

        // Get the actual model string from config
        $modelIdentifierPath = "ai.providers.{$providerName}.models.{$modelSize}";
        if (! $this->config->has($modelIdentifierPath)) {
            Log::channel('mcp')->error("Model size '{$modelSize}' is not configured for provider '{$providerName}'");
            throw new InvalidArgumentException("Model size '{$modelSize}' is not configured for provider '{$providerName}'");
        }
        $modelNameString = $this->config->get($modelIdentifierPath);
        if (empty($modelNameString)) {
            Log::channel('mcp')->error("Model identifier string is empty for provider '{$providerName}', size '{$modelSize}'");
            throw new InvalidArgumentException("Model identifier string is empty for provider '{$providerName}', size '{$modelSize}'");
        }

        Log::channel('mcp')->debug("Using Provider='{$providerName}', Model='{$modelNameString}' for project_ask.");

        // Create question service - constructor now has no parameters
        $questionService = resolve(ProjectQuestionService::class);

        // --- Start: Refactored State Key Handling ---
        $stateKey = null; // This will hold the final state key to use (either existing or new)
        $history = [];    // Initialize empty history
        $attemptedStateKey = $arguments['state'] ?? null; // Get the raw input from the arguments

        // Check if a potentially valid key (non-empty string) was provided
        if (is_string($attemptedStateKey) && $attemptedStateKey !== '') {
            Log::channel('mcp')->info("Attempting to continue conversation with provided state key: {$attemptedStateKey}");
            try {
                $history = $this->stateService->loadHistory($attemptedStateKey);
            } catch (\Exception $e) {
                // Log error if loading history fails, but proceed to create a new state
                Log::channel('mcp')->error("Error loading history for state key '{$attemptedStateKey}': ".$e->getMessage());
                $history = []; // Ensure history is empty
            }

            if (! empty($history)) {
                // History loaded successfully, use the provided key
                $stateKey = $attemptedStateKey;
                Log::channel('mcp')->debug('Loaded '.count($history)." messages for state key: {$stateKey}");
            } else {
                // Valid string key provided, but no history found (e.g., invalid key, expired, DB error)
                Log::channel('mcp')->warning("State key '{$attemptedStateKey}' provided, but no history found or error loading. Starting a new conversation.");
                // Generate a new key, history remains empty
                $stateKey = $this->stateService->generateStateKey();
                Log::channel('mcp')->info("Generated new state key for this session: {$stateKey}");
            }
        } else {
            // Handle cases where state is null, empty string, or any other invalid type (boolean, int, array, object)
            if ($attemptedStateKey !== null) {
                // Log a warning if the provided value was invalid (not null and not a non-empty string)
                $invalidType = gettype($attemptedStateKey);
                Log::channel('mcp')->warning("Invalid type or empty value received for 'state' argument (type: {$invalidType}). Starting a new conversation.");
            } else {
                // Standard case: No state provided, starting fresh.
                Log::channel('mcp')->info('No valid state key provided. Starting a new conversation.');
            }
            // Generate a new key, history remains empty
            $stateKey = $this->stateService->generateStateKey();
            Log::channel('mcp')->info("Generated new state key: {$stateKey}");
        }
        // --- End: Refactored State Key Handling ---

        // Gather project context
        $copytreeOutput = $this->gatherProjectContext($projectPath);

        // Process the question with the AI service
        $processedData = $this->processQuestionWithAI(
            $questionService,
            $copytreeOutput,
            $question,
            $history,
            $stateKey,
            $providerName,
            $modelNameString,
            $streamRequested
        );

        // Check if streaming was requested
        if (isset($processedData['streaming_request']) && $processedData['streaming_request'] === true) {
            // Return the streaming request data for handling by McpCommand
            return $processedData;
        }

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
     * @param  string  $providerName  The AI provider name.
     * @param  string  $modelNameString  The AI model identifier string.
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
        string $providerName,
        string $modelNameString,
        bool $streamRequested = false
    ): array {
        try {
            if ($streamRequested) {
                Log::channel('mcp')->info("Streaming response requested for question, Provider: [{$providerName}], Model: [{$modelNameString}]");

                // For streaming, we'll return a special structure that indicates
                // streaming should be handled by the caller (McpCommand)
                return [
                    'streaming_request' => true,
                    'copytreeOutput' => $copytreeOutput,
                    'question' => $question,
                    'history' => $history,
                    'stateKey' => $stateKey,
                    'providerName' => $providerName,
                    'modelNameString' => $modelNameString,
                ];
            }

            // Non-streaming path: Call askQuestion with the new signature
            $apiResponse = $questionService->askQuestion(
                $copytreeOutput,
                $question,
                $history,
                $providerName,
                $modelNameString
            );

            // Extract content from Prism response
            $fullResponseText = $apiResponse->text;

            // Extract token usage from Prism response
            $usage = $apiResponse->usage;
            $inputTokens = $usage->promptTokens ?? 0;
            $outputTokens = $usage->completionTokens ?? 0;
            $cachedInputTokens = 0; // Default to 0

            // Check for provider-specific cached token information
            if ($providerName === 'anthropic' && ! empty($apiResponse->additionalContent)) {
                $additionalContent = $apiResponse->additionalContent;

                // Try different possible locations where Anthropic might report cached tokens
                if (isset($additionalContent['usage']['cache_read_input_tokens'])) {
                    $cachedInputTokens = (int) $additionalContent['usage']['cache_read_input_tokens'];
                    Log::channel('mcp')->debug("Anthropic cached input tokens: {$cachedInputTokens}");
                } elseif (isset($additionalContent['cached_tokens'])) {
                    $cachedInputTokens = (int) $additionalContent['cached_tokens'];
                    Log::channel('mcp')->debug("Anthropic cached input tokens (alternative key): {$cachedInputTokens}");
                }
            }

            // Calculate cost
            $totalCost = 0.0;
            // Need to determine model size from model string for pricing lookup
            $modelSize = $this->getModelSizeFromString($providerName, $modelNameString);
            $pricingConfigKey = "ai.providers.{$providerName}.pricing.{$modelSize}";
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
                    Log::channel('mcp')->warning("One or more pricing values missing/invalid for {$providerName}:{$modelSize}. Cost not calculated.");
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
            $followUpHintText = sprintf(
                'Ask follow-up questions with `state`: %s',
                $stateKey
            );
            Log::channel('mcp')->debug('State: '.$stateKey);
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

    /**
     * Determines the model size from the provider and model string.
     * This is a reverse lookup from the config.
     */
    protected function getModelSizeFromString(string $providerName, string $modelNameString): string
    {
        $models = $this->config->get("ai.providers.{$providerName}.models", []);

        foreach ($models as $size => $model) {
            if ($model === $modelNameString) {
                return $size;
            }
        }

        // Default to 'small' if not found
        Log::channel('mcp')->warning("Could not determine model size for {$providerName}:{$modelNameString}, defaulting to 'small'");

        return 'small';
    }

    /**
     * Calculate the cost for AI usage.
     *
     * @param  string  $providerName  The AI provider name.
     * @param  string  $modelNameString  The AI model identifier.
     * @param  int  $inputTokens  Number of input tokens.
     * @param  int  $outputTokens  Number of output tokens.
     * @param  int  $cachedInputTokens  Number of cached input tokens.
     * @return array Cost calculation results.
     */
    public function calculateCost(
        string $providerName,
        string $modelNameString,
        int $inputTokens,
        int $outputTokens,
        int $cachedInputTokens
    ): array {
        $totalCost = 0.0;
        $modelSize = $this->getModelSizeFromString($providerName, $modelNameString);
        $pricingConfigKey = "ai.providers.{$providerName}.pricing.{$modelSize}";
        $pricingFound = $this->config->has($pricingConfigKey);
        $pricesAvailable = false;

        if ($pricingFound) {
            $pricing = $this->config->get($pricingConfigKey);
            $inputPrice = $pricing['input'] ?? null;
            $outputPrice = $pricing['output'] ?? null;
            $cachedInputPrice = $pricing['cached_input'] ?? $inputPrice;

            $pricesAvailable = is_numeric($inputPrice) && is_numeric($outputPrice) &&
                              (is_numeric($cachedInputPrice) || $cachedInputTokens === 0);

            if ($pricesAvailable) {
                $nonCachedInputTokens = $inputTokens - $cachedInputTokens;
                if ($nonCachedInputTokens > 0) {
                    $totalCost += ($nonCachedInputTokens / 1000000) * $inputPrice;
                }
                if ($cachedInputTokens > 0 && is_numeric($cachedInputPrice) && $cachedInputPrice > 0) {
                    $totalCost += ($cachedInputTokens / 1000000) * $cachedInputPrice;
                }
                if ($outputTokens > 0) {
                    $totalCost += ($outputTokens / 1000000) * $outputPrice;
                }
            } else {
                Log::channel('mcp')->warning("One or more pricing values missing/invalid for {$providerName}:{$modelSize}. Cost not calculated.");
                $pricingFound = false;
            }
        } else {
            Log::channel('mcp')->warning("Pricing configuration key '{$pricingConfigKey}' not found. Cost not calculated.");
        }

        return compact('totalCost', 'pricingFound', 'pricesAvailable');
    }
}
