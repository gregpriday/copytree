<?php

namespace App\Commands;

use LaravelZero\Framework\Commands\Command;
use App\Services\ProjectQuestionService;
use App\Services\ConversationStateService;
use Illuminate\Contracts\Config\Repository as ConfigContract;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Log; // Import the Log facade

// NOTE: No longer need OutputInterface here as we use the Log facade
// use Symfony\Component\Console\Output\OutputInterface;

class McpCommand extends Command
{
    /**
     * The signature of the command.
     * @var string
     */
    protected $signature = 'mcp {directory}';

    /**
     * The description of the command.
     * @var string
     */
    protected $description = 'Starts the CopyTree MCP server using STDIO to handle project questions.';

    /**
     * Execute the console command.
     *
     * @param ConversationStateService $stateService
     * @return int
     */
    public function handle(ConversationStateService $stateService): int
    {
        // --- Determine the Correct Project Directory ---
        $projectRootEnv = $this->argument('directory');
        $serverWorkingDirectory = null;

        if ($projectRootEnv && is_dir($projectRootEnv)) {
            $serverWorkingDirectory = $projectRootEnv;
            Log::channel('mcp')->info("Using project root from WORKING_DIR env var: " . $serverWorkingDirectory);
        } else {
            // Fatal error if no valid directory is provided
            Log::channel('mcp')->error("Invalid directory provided: " . $projectRootEnv);
            $this->error("Invalid directory provided: " . $projectRootEnv);
            return self::FAILURE;
        }

        Log::channel('mcp')->info("Starting CopyTree STDIO Server for directory: " . $serverWorkingDirectory);
        Log::channel('mcp')->info("Listening for JSON-RPC requests on STDIN...");

        // --- Resolve Services Needed ---
        $config = resolve(ConfigContract::class);

        // --- Main STDIN Read Loop ---
        while (($line = fgets(STDIN)) !== false) {
            $data = trim($line);
            if (empty($data)) {
                continue;
            }

            // --- Raw Data Logging (to mcp.log) ---
            $isPotentialToolCall = (str_contains($data, '"method"') && str_contains($data, '"tools/call"'));
            if ($isPotentialToolCall) {
                Log::channel('mcp')->debug("[RAW_DATA] STDIN (potential tools/call): " . $data);
            } elseif (strlen($data) < 250) {
                Log::channel('mcp')->debug("[RAW_DATA] STDIN (short message): " . $data);
            } else {
                Log::channel('mcp')->debug("[RAW_DATA] STDIN (message prefix): " . substr($data, 0, 250) . "...");
            }
            // --- End Raw Data Logging ---

            $finalResponse = null;
            $requestId = null;
            $isRequest = false;

            try {
                // 1. Parse the incoming data
                $request = json_decode($data, true);

                // Basic JSON structure check
                if (json_last_error() !== JSON_ERROR_NONE || !is_array($request)) {
                    $errorMsg = function_exists('json_last_error_msg') ? json_last_error_msg() : 'JSON decode error code ' . json_last_error();
                    Log::channel('mcp')->error("Invalid JSON received: " . $errorMsg . " - Raw Data: " . $data);
                    continue;
                }

                // Log Decoded Request Structure
                Log::channel('mcp')->debug("[DECODED_REQUEST] Structure: " . var_export($request, true));

                $method = $request['method'] ?? null;
                $params = $request['params'] ?? [];
                $requestId = $request['id'] ?? null;

                $isRequest = ($requestId !== null);
                $isNotification = (!$isRequest && $method !== null);

                if ($isRequest && $method) {
                    // --- Handle Requests ---
                    Log::channel('mcp')->debug("Processing Request ID: {$requestId}, Method: {$method}");
                    $responsePayload = null;

                    if ($method === 'initialize') {
                        Log::channel('mcp')->info("Handling 'initialize' request ID: {$requestId}");
                        $serverCapabilities = ['tools' => ['listChanged' => false]];
                        $serverInfo = ['name' => 'copytree-mcp-server', 'version' => '0.1.0'];
                        $responsePayload = [
                            'protocolVersion' => '2024-11-05',
                            'serverInfo' => $serverInfo,
                            'capabilities' => $serverCapabilities
                        ];
                        $finalResponse = json_encode(['jsonrpc' => '2.0', 'result' => $responsePayload, 'id' => $requestId]);

                    } elseif ($method === 'tools/list') {
                        Log::channel('mcp')->info("Handling 'tools/list' request ID: {$requestId}");
                        $descriptionFilePath = resource_path('mcp_descriptions/project_ask.txt');
                        $detailedDescription = '[Default Description] Asks a question about the current project codebase.';
                        if (File::exists($descriptionFilePath)) {
                            try {
                                $detailedDescription = File::get($descriptionFilePath);
                            } catch (\Exception $e) {
                                Log::channel('mcp')->warning("Failed to load tool description from {$descriptionFilePath}: " . $e->getMessage());
                            }
                        } else {
                            Log::channel('mcp')->warning("Tool description file not found: {$descriptionFilePath}");
                        }

                        $inputSchema = [
                            'type' => 'object',
                            'properties' => [
                                'question' => ['description' => 'The question to ask about the project.', 'type' => 'string'],
                                'state' => ['description' => 'Optional state key to continue a previous conversation. Omit to start a new one.', 'type' => 'string'],
                                'ask-provider' => ['description' => 'Override AI provider (e.g., openai). Defaults to config.', 'type' => 'string'],
                                'ask-model-size' => ['description' => 'Override AI model size (small, medium, large). Defaults to config.', 'type' => 'string'],
                            ],
                            'required' => ['question']
                        ];
                        $askTool = [
                            'name' => 'project_ask',
                            'description' => trim($detailedDescription),
                            'inputSchema' => $inputSchema
                        ];
                        $responsePayload = ['tools' => [$askTool]];
                        $finalResponse = json_encode(['jsonrpc' => '2.0', 'result' => $responsePayload, 'id' => $requestId]);

                    } elseif ($method === 'tools/call') {
                        Log::channel('mcp')->info("Handling 'tools/call' request ID: {$requestId}");

                        $toolName = null;
                        if (isset($params['name']) && is_string($params['name'])) {
                            $toolName = trim($params['name']);
                        }
                        $receivedNameParamForLog = $params['name'] ?? '[PARAM \'name\' NOT SET]';
                        Log::channel('mcp')->debug("tools/call received 'name' param: '" . $receivedNameParamForLog . "'");
                        Log::channel('mcp')->debug("tools/call processed toolName variable: '" . ($toolName ?? 'null') . "'");

                        $args = $params['arguments'] ?? [];

                        if ($toolName !== 'project_ask') {
                            Log::channel('mcp')->error("Tool name mismatch or missing. Expected 'project_ask', got: '" . ($toolName ?? 'null') . "'");
                            throw new \InvalidArgumentException("Unsupported tool: " . ($toolName ?? '[Not provided or invalid]'));
                        }

                        Log::channel('mcp')->debug("Tool name matched 'project_ask'. Proceeding...");

                        $question = $args['question'] ?? null;
                        if (!$question) {
                            Log::channel('mcp')->error("Missing 'question' argument in tools/call request ID: {$requestId}");
                            throw new \InvalidArgumentException("'question' is required.");
                        }
                        $stateKey = $args['state'] ?? null;
                        $providerOption = $args['ask-provider'] ?? null;
                        $modelSizeOption = $args['ask-model-size'] ?? null;

                        $provider = $providerOption ?: $config->get('ai.ask_defaults.provider', 'openai');
                        $modelSize = $modelSizeOption ?: $config->get('ai.ask_defaults.model_size', 'small');
                        Log::channel('mcp')->debug("Using Provider='{$provider}', ModelSize='{$modelSize}' for project_ask.");

                        $questionService = resolve(ProjectQuestionService::class, [
                            'provider' => $provider,
                            'modelSize' => $modelSize,
                        ]);

                        $history = [];
                        $isNewConversation = false;
                        if ($stateKey) {
                            Log::channel('mcp')->info("Continuing conversation with state key: {$stateKey}");
                            $history = $stateService->loadHistory($stateKey);
                            if (empty($history)) {
                                Log::channel('mcp')->warning("State key '{$stateKey}' provided, but no history found. Starting fresh.");
                            }
                        } else {
                            $stateKey = $stateService->generateStateKey();
                            Log::channel('mcp')->info("Starting new conversation with state key: {$stateKey}");
                            $isNewConversation = true;
                        }

                        // --- Get Project Context using Artisan 'copy' Command ---
                        Log::channel('mcp')->debug("Gathering project context using 'copy' command...");
                        Log::channel('mcp')->debug("Using path for 'copy' command: '" . $serverWorkingDirectory . "'");
                        $copytreeOutput = null;
                        try {
                            $copyOptions = [
                                'path' => $serverWorkingDirectory,
                                '--display' => true,
                                '--no-interaction' => true,
                            ];
                            Log::channel('mcp')->debug("Options passed to Artisan::call('copy'): " . json_encode($copyOptions));

                            Artisan::call('copy', $copyOptions);
                            $copytreeOutput = Artisan::output();

                            if (empty(trim($copytreeOutput))) {
                                Log::channel('mcp')->error("'copy' command returned empty output when gathering context.");
                                throw new \RuntimeException("Failed to gather project context: 'copy' command returned empty output.");
                            }
                            Log::channel('mcp')->debug("Generated copytree output length: " . strlen($copytreeOutput));

                        } catch (\Exception $e) {
                            Log::channel('mcp')->error("Failed to run 'copy' command to get context: " . $e->getMessage());
                            throw new \RuntimeException("Failed to gather project context via copy command: " . $e->getMessage(), 0, $e);
                        }

                        $fullResponseText = '';
                        try {
                            $apiResponse = $questionService->askQuestion($copytreeOutput, $question, $history);
                            $fullResponseText = $apiResponse->choices[0]->message->content ?? '';
                            $stateService->saveMessage($stateKey, 'user', $question);
                            $stateService->saveMessage($stateKey, 'assistant', $fullResponseText);
                        } catch (\Exception $e) {
                            Log::channel('mcp')->error("Error during question processing: {$e->getMessage()}");
                            throw new \RuntimeException("Error answering question: {$e->getMessage()}", 0, $e);
                        }
                        Log::channel('mcp')->info("Successfully processed 'project_ask' for request ID: {$requestId}");

                        // --- Construct Correct CallToolResult Payload ---

                        // 1. Create the TextContent object containing the AI's answer
                        $textContent = [
                            'type' => 'text',
                            'text' => $fullResponseText
                        ];

                        // 2. Create the main result structure required by MCP
                        $responsePayload = [
                            // 'content' MUST be an array containing one or more content objects
                            'content' => [$textContent],
                            'isError' => false // Indicate success
                        ];

                        // 3. (Optional but Recommended) Add state_key to metadata if needed
                        if ($isNewConversation && $stateKey) {
                            // The spec doesn't define state_key, so _meta is a safer place
                             if (!isset($responsePayload['_meta'])) { // Ensure _meta exists
                                 $responsePayload['_meta'] = [];
                             }
                             $responsePayload['_meta']['state_key'] = $stateKey;
                             Log::channel('mcp')->debug("Included new state_key '{$stateKey}' in response _meta");
                        }
                        // --- End Payload Construction ---

                        // This line encodes the final JSON-RPC response - KEEP AS IS
                        $finalResponse = json_encode(['jsonrpc' => '2.0', 'result' => $responsePayload, 'id' => $requestId]);

                    } else {
                        // Unknown Request Method
                        Log::channel('mcp')->error("Unknown Request Method: {$method} (ID: {$requestId})");
                        throw new \InvalidArgumentException("Unknown request method: {$method}");
                    }

                } elseif ($isNotification && $method) {
                    // --- Handle Notifications ---
                    Log::channel('mcp')->debug("Processing Notification Method: {$method}");

                    if ($method === 'notifications/initialized' || $method === 'initialized') {
                        Log::channel('mcp')->info("Received 'initialized' notification from client. Acknowledged.");
                    }
                    elseif ($method === 'exit') {
                        Log::channel('mcp')->info("Received 'exit' notification. Server loop will terminate.");
                        break; // Exit the while loop
                    }
                    elseif ($method === '$/cancelRequest') {
                        $cancelledRequestId = $params['id'] ?? null;
                        Log::channel('mcp')->info("Received request cancellation for ID: " . ($cancelledRequestId ?? 'null'));
                        // Add cancellation logic here if needed
                    }
                    else {
                        Log::channel('mcp')->warning("Received and ignored unknown notification method: {$method}");
                    }
                    $finalResponse = null;

                } else {
                    // Invalid structure
                    Log::channel('mcp')->error("Invalid JSON-RPC message structure received. Data: " . $data);
                    if ($requestId !== null) {
                        throw new \InvalidArgumentException("Invalid JSON-RPC message structure");
                    }
                    continue;
                }

            } catch (\Exception $e) {
                // Send error JSON response ONLY IF it was a request
                if ($isRequest) {
                    Log::channel('mcp')->error("Error processing request ID {$requestId}: " . $e->getMessage() . "\n" . $e->getTraceAsString());
                    $errorPayload = [
                        'code' => -32000,
                        'message' => $e->getMessage(),
                        // Optionally include stack trace in 'data' during development
                        // 'data' => $e->getTraceAsString()
                    ];
                    $finalResponse = json_encode(['jsonrpc' => '2.0', 'error' => $errorPayload, 'id' => $requestId]);
                } else {
                    Log::channel('mcp')->error("Error processing notification or invalid message: " . $e->getMessage() . "\n" . $e->getTraceAsString());
                    $finalResponse = null;
                }
            }

            // --- Send Response to STDOUT (only if $finalResponse was set) ---
            if ($finalResponse) {
                Log::channel('mcp')->debug("[STDOUT] Sending response (ID: {$requestId}) Length: " . strlen($finalResponse));
                // Log response content only if short enough or if debug level is very high
                if (strlen($finalResponse) < 500 || env('LOG_MCP_LEVEL') === 'debug') {
                    Log::channel('mcp')->debug("[STDOUT_DATA] " . $finalResponse);
                } else {
                    Log::channel('mcp')->debug("[STDOUT_DATA] " . substr($finalResponse, 0, 500) . "... (truncated)");
                }
                fwrite(STDOUT, $finalResponse . "\n");
                fflush(STDOUT);
            }

        } // End while loop reading from STDIN

        if (feof(STDIN)) {
            Log::channel('mcp')->info("STDIN stream closed. Exiting server.");
        } else {
            Log::channel('mcp')->error("Error reading from STDIN. Exiting server.");
        }

        return self::SUCCESS;
    }
}
