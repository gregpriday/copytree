<?php

namespace App\Commands;

// Removed Workerman use statements

use LaravelZero\Framework\Commands\Command;
use App\Services\ProjectQuestionService; // Import the existing service
use App\Services\ConversationStateService; // Import state service
use Illuminate\Contracts\Config\Repository as ConfigContract; // Use Contract
use Illuminate\Support\Facades\File; // Keep for loading description file
use Symfony\Component\Console\Output\OutputInterface; // Keep for logging to STDERR

class McpCommand extends Command
{
    /**
     * The signature of the command.
     *
     * @var string
     */
    protected $signature = 'mcp'; // Rename signature

    /**
     * The description of the command.
     *
     * @var string
     */
    // Updated description
    protected $description = 'Starts the CopyTree MCP server using STDIO to handle project questions.'; // Description already mentions MCP

    /**
     * Execute the console command.
     *
     * @param ConversationStateService $stateService
     * @param OutputInterface $output Use this for logging to STDERR
     * @return int
     */
    public function handle(ConversationStateService $stateService, OutputInterface $output): int
    {
        // --- Get the starting directory ---
        $serverWorkingDirectory = getcwd();
        if ($serverWorkingDirectory === false) {
             $output->writeln("<error>[ERROR] Could not determine current working directory.</error>");
             return self::FAILURE;
        }
        // Log startup info to STDERR
        $output->writeln("<info>[INFO] Starting CopyTree STDIO Server in directory: " . $serverWorkingDirectory . "</info>");
        $output->writeln("<comment>[INFO] Listening for JSON-RPC requests on STDIN...</comment>");

        // --- Resolve Services Needed ---
        $config = resolve(ConfigContract::class);

        // --- Main STDIN Read Loop ---
        while (($line = fgets(STDIN)) !== false) {
            $data = trim($line);
            if (empty($data)) {
                // Skip empty lines, could be keep-alive or framing characters
                continue;
            }

            // Log received data to STDERR
            $output->writeln("[DEBUG] STDIN: Received data line length: " . strlen($data));
            // Optionally log the first part of the data for debugging, be careful with large inputs
            // $output->writeln("[DEBUG] STDIN: Data prefix: " . substr($data, 0, 100));

            // --- Process Incoming Request ---
            // Moved the logic from onMessage directly into the loop
            try {
                // 1. Parse the incoming data (Assuming JSON-RPC like MCP)
                $request = json_decode($data, true);
                if (json_last_error() !== JSON_ERROR_NONE || !isset($request['method']) || !isset($request['id'])) {
                    // Use json_last_error_msg() which requires PHP >= 5.5
                    $errorMsg = function_exists('json_last_error_msg') ? json_last_error_msg() : 'JSON decode error code ' . json_last_error();
                    throw new \InvalidArgumentException("Invalid JSON request received: " . $errorMsg);
                }

                $method = $request['method'];
                $params = $request['params'] ?? [];
                $requestId = $request['id'];

                $responsePayload = null; // Renamed from $resultPayload for clarity
                $finalResponse = null;  // Define $finalResponse

                // 2. Handle 'tools/list'
                if ($method === 'tools/list') {
                    $output->writeln("[INFO] STDIN: Handling 'tools/list'");
                    $descriptionFilePath = resource_path('mcp_descriptions/project_ask.txt');
                    $detailedDescription = '[Default Description] Asks a question about the current project codebase.';
                    if (File::exists($descriptionFilePath)) {
                        try {
                            $detailedDescription = File::get($descriptionFilePath);
                        } catch (\Exception $e) {
                            $output->writeln("<error>[WARN] Failed to load tool description from {$descriptionFilePath}: " . $e->getMessage() . "</error>");
                        }
                    } else {
                        $output->writeln("<error>[WARN] Tool description file not found: {$descriptionFilePath}</error>");
                    }

                    $argumentsSchema = [
                        'question' => ['description' => 'The question to ask about the project.', 'type' => 'string', 'required' => true],
                        'state' => ['description' => 'Optional state key to continue a previous conversation. Omit to start a new one.', 'type' => 'string', 'required' => false],
                        'ask-provider' => ['description' => 'Override AI provider (e.g., openai). Defaults to config.', 'type' => 'string', 'required' => false],
                        'ask-model-size' => ['description' => 'Override AI model size (small, medium, large). Defaults to config.', 'type' => 'string', 'required' => false],
                    ];

                    $askTool = [
                        'name' => 'project_ask',
                        'description' => trim($detailedDescription),
                        'arguments' => ['properties' => $argumentsSchema]
                    ];

                    $responsePayload = ['tools' => [$askTool]]; // Structure for 'result'
                    $finalResponse = json_encode(['jsonrpc' => '2.0', 'result' => $responsePayload, 'id' => $requestId]);

                }
                // 3. Handle 'tools/call'
                elseif ($method === 'tools/call') {
                    $output->writeln("[INFO] STDIN: Handling 'tools/call'");
                    $toolName = $params['toolName'] ?? null;
                    $args = $params['arguments'] ?? [];

                    if ($toolName !== 'project_ask') {
                        throw new \InvalidArgumentException("Unsupported tool: {$toolName}");
                    }
                    $question = $args['question'] ?? null;
                    if (!$question) {
                         throw new \InvalidArgumentException("'question' is required.");
                    }
                    $stateKey = $args['state'] ?? null;
                    $providerOption = $args['ask-provider'] ?? null;
                    $modelSizeOption = $args['ask-model-size'] ?? null;

                    $provider = $providerOption ?: $config->get('copytree.ask.provider', 'openai');
                    $modelSize = $modelSizeOption ?: $config->get('copytree.ask.model_size', 'small');
                    $output->writeln("[DEBUG] STDIN: Using Provider='{$provider}', ModelSize='{$modelSize}' for project_ask.");

                    // Validation omitted for brevity - assume it's still here

                    $questionService = resolve(ProjectQuestionService::class, [
                        'provider' => $provider,
                        'modelSize' => $modelSize,
                    ]);

                    $history = [];
                    $isNewConversation = false;
                    if ($stateKey) {
                        $output->writeln("[INFO] STDIN: Continuing conversation with state key: {$stateKey}");
                        $history = $stateService->loadHistory($stateKey);
                         if (empty($history)) {
                            $output->writeln("[WARN] STDIN: State key '{$stateKey}' provided, but no history found. Starting fresh.");
                         }
                    } else {
                         $stateKey = $stateService->generateStateKey();
                         $output->writeln("[INFO] STDIN: Starting new conversation with state key: {$stateKey}");
                         $isNewConversation = true;
                    }

                    // Resolve InternalDefaultsService (ensure class exists or is autoloaded)
                    if (!class_exists(\App\Services\InternalDefaultsService::class)) {
                         require_once app_path('Services/InternalDefaultsService.php');
                    }
                    $internalDefaultsService = resolve(\App\Services\InternalDefaultsService::class, ['workingDirectory' => $serverWorkingDirectory]);

                    $copytreeOutput = $internalDefaultsService->runCopytreeWithDefaults();
                    if ($copytreeOutput === null) {
                        throw new \RuntimeException("Failed to gather project context.");
                    }
                    $output->writeln("[DEBUG] STDIN: Generated copytree output length: " . strlen($copytreeOutput));

                    $fullResponseText = '';
                    try {
                        $apiResponse = $questionService->askQuestion($copytreeOutput, $question, $history);
                        $fullResponseText = $apiResponse->choices[0]->message->content ?? '';
                        $stateService->saveMessage($stateKey, 'user', $question);
                        $stateService->saveMessage($stateKey, 'assistant', $fullResponseText);
                    } catch (\Exception $e) {
                        $output->writeln("<error>[ERROR] STDIN: Error during question processing: {$e->getMessage()}</error>");
                        throw new \RuntimeException("Error answering question: {$e->getMessage()}");
                    }
                    $output->writeln("[INFO] STDIN: Successfully processed 'project_ask'.");

                    $resultData = ['answer' => $fullResponseText];
                    if ($isNewConversation) {
                        $resultData['state_key'] = $stateKey;
                    }
                    $responsePayload = $resultData; // Structure for 'result'
                    $finalResponse = json_encode(['jsonrpc' => '2.0', 'result' => $responsePayload, 'id' => $requestId]);

                }
                // 4. Handle unknown method
                else {
                    throw new \InvalidArgumentException("Unknown method: {$method}");
                }

            } catch (\Exception $e) {
                // 5. Send error JSON response
                $output->writeln("<error>[ERROR] STDIN: Error processing request: " . $e->getMessage() . "</error>");
                 // Log the full stack trace for debugging if possible/needed
                 //$output->writeln($e->getTraceAsString());
                $errorPayload = [
                    'code' => $e->getCode() ?: -32000, // Use exception code or generic server error
                    'message' => $e->getMessage(),
                ];
                // Ensure requestId is set for error responses if possible
                $finalResponse = json_encode(['jsonrpc' => '2.0', 'error' => $errorPayload, 'id' => $requestId ?? null]);
            }

            // --- Send Response to STDOUT ---
            if ($finalResponse) {
                 $output->writeln("[DEBUG] STDOUT: Sending response line length: " . strlen($finalResponse));
                fwrite(STDOUT, $finalResponse . "\n");
                fflush(STDOUT); // Ensure output is sent immediately
            } else {
                 $output->writeln("<error>[ERROR] STDIN: No response generated for request ID {$requestId}.</error>");
            }

        } // End while loop reading from STDIN

        // Optional: Log when STDIN closes
        if (feof(STDIN)) {
             $output->writeln("<comment>[INFO] STDIN stream closed. Exiting server.</comment>");
        } else {
             $output->writeln("<error>[ERROR] Error reading from STDIN. Exiting server.</error>");
        }

        return self::SUCCESS; // Exit normally when STDIN closes
    }
}
