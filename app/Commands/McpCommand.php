<?php

namespace App\Commands;

use App\Services\ConversationStateService;
use App\Services\MCPService;
use App\Services\ProjectQuestionService;
use Illuminate\Contracts\Config\Repository as ConfigContract;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use LaravelZero\Framework\Commands\Command;
// --- MCP SDK Imports ---
use Mcp\Server\InitializationOptions;
use Mcp\Server\Server;
use Mcp\Server\ServerRunner;
use Mcp\Shared\ErrorData as McpErrorData;
use Mcp\Shared\McpError;
use Mcp\Types\CallToolRequestParams; // Although PingRequest is used client-side, we check the method name 'ping'
use Mcp\Types\CallToolResult;
use Mcp\Types\EmptyResult;
use Mcp\Types\ListToolsResult;
use Mcp\Types\PaginatedRequestParams;
use Mcp\Types\PingRequest;
use Mcp\Types\ServerCapabilities;
use Mcp\Types\ServerToolsCapability;
use Mcp\Types\TextContent;
use Mcp\Types\Tool;
use Mcp\Types\ToolInputProperties;
use Mcp\Types\ToolInputSchema;

// --- End MCP SDK Imports ---

class McpCommand extends Command
{
    /**
     * The signature of the command.
     *
     * @var string
     */
    protected $signature = 'mcp {directory?}';

    /**
     * The description of the command.
     *
     * @var string
     */
    protected $description = 'Starts the CopyTree MCP server using the MCP SDK library.';

    /**
     * The configuration repository instance.
     */
    protected ConfigContract $config;

    /**
     * The MCP service instance.
     */
    protected MCPService $mcpService;

    /**
     * Create a new McpCommand instance.
     *
     * @return void
     */
    public function __construct(ConfigContract $config, MCPService $mcpService)
    {
        parent::__construct();
        $this->config = $config;
        $this->mcpService = $mcpService;
    }

    /**
     * Execute the console command using the MCP SDK ServerRunner.
     */
    public function handle(): int
    {
        // --- Determine Project Directory ---
        $serverWorkingDirectory = $this->argument('directory') ?? getcwd();
        if (! $serverWorkingDirectory || ! is_dir($serverWorkingDirectory)) {
            Log::channel('mcp')->error('Invalid directory provided: '.($serverWorkingDirectory ?: 'null'));
            $this->error('Invalid directory provided: '.($serverWorkingDirectory ?: 'null'));

            return self::FAILURE;
        }

        // --- Initialize Logger ---
        // The SDK ServerRunner creates a default STDERR logger,
        // but we can pass Laravel's logger for consistent logging.
        $logger = Log::channel('mcp'); // Get the PSR-3 compliant logger instance

        $logger->info('Starting CopyTree MCP SDK Server for directory: '.$serverWorkingDirectory);

        try {
            // --- Configure MCP Server ---
            $server = new Server('copytree-mcp-server', $logger);

            // --- Register Request Handlers ---
            // $server->registerHandler('initialize', [$this, 'handleInitialize']); // Handled by SDK Session
            $server->registerHandler('ping', [$this, 'handlePing']);
            $server->registerHandler('tools/list', [$this, 'handleToolsList']);
            // Pass the working directory context to the handler
            $server->registerHandler('tools/call', function (CallToolRequestParams $params) use ($serverWorkingDirectory, $logger) {
                return $this->handleToolsCall($params, $serverWorkingDirectory, $logger);
            });
            // Add handlers for other methods if needed (e.g., resources/list)

            // --- Register Notification Handlers ---
            $server->registerNotificationHandler('notifications/initialized', [$this, 'handleNotificationInitialized']);
            $server->registerNotificationHandler('$/cancelRequest', [$this, 'handleNotificationCancel']);
            // Add handler for 'exit' if you want custom logic before shutdown
            // $server->registerNotificationHandler('exit', [$this, 'handleNotificationExit']);

            // --- Define Server Capabilities ---
            $capabilities = new ServerCapabilities(
                // Only advertise the capabilities you actually handle
                tools: new ServerToolsCapability(listChanged: false) // Assuming tools list doesn't change dynamically
                // Add other capabilities like ServerPromptsCapability, ServerResourcesCapability if implemented
            );

            // --- Create Initialization Options ---
            $initOptions = new InitializationOptions(
                serverName: 'copytree-mcp-server',
                serverVersion: '0.2.0', // Update version as appropriate
                capabilities: $capabilities
            );

            // --- Create and Run the ServerRunner ---
            // ServerRunner uses StdioServerTransport by default
            $runner = new ServerRunner($server, $initOptions, $logger);

            $logger->info('MCP Server Runner starting. Listening on STDIO...');
            $runner->run(); // This enters the main loop handled by the SDK

            $logger->info('MCP Server Runner finished.');

            return self::SUCCESS;

        } catch (\Throwable $e) {
            $logger->error('MCP Server crashed: '.$e->getMessage(), [
                'exception' => $e::class,
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString(), // Be cautious logging full traces in production
            ]);
            $this->error('Server error: '.$e->getMessage());

            return self::FAILURE;
        }
    }

    // --- Handler Implementations ---

    /**
     * Handles the 'ping' request.
     * The SDK automatically uses this handler if registered.
     *
     * @param  array|null  $params  Request parameters (should be null for ping).
     */
    public function handlePing(?array $params): EmptyResult
    {
        Log::channel('mcp')->debug("Handling 'ping' request.");

        return new EmptyResult; // Return the specific EmptyResult type
    }

    /**
     * Handles the 'tools/list' request.
     *
     * @param  PaginatedRequestParams|null  $params  Request parameters (e.g., pagination cursor, unused here).
     */
    public function handleToolsList(?PaginatedRequestParams $params): ListToolsResult
    {
        Log::channel('mcp')->info("Handling 'tools/list' request.");
        $descriptionFilePath = resource_path('mcp_descriptions/project_ask.txt');
        $detailedDescription = '[Default Description] Asks a question about the current project codebase.';
        if (File::exists($descriptionFilePath)) {
            try {
                $detailedDescription = File::get($descriptionFilePath);
            } catch (\Exception $e) {
                Log::channel('mcp')->warning("Failed to load tool description from {$descriptionFilePath}: ".$e->getMessage());
            }
        } else {
            Log::channel('mcp')->warning("Tool description file not found: {$descriptionFilePath}");
        }

        // Define properties using ToolInputProperties
        $properties = new ToolInputProperties;
        $properties->question = ['description' => 'The question to ask about the project.', 'type' => 'string'];
        $properties->state = [
            'description' => 'Optional *string* key to continue a previous conversation. Must be the exact key provided by a previous response. Omit to start a new conversation.',
            'type' => 'string',
        ];
        $properties->stream = [
            'description' => 'Optional boolean to request a streaming response. Defaults to false.',
            'type' => 'boolean',
        ];

        // Define the schema using ToolInputSchema
        $inputSchema = new ToolInputSchema(
            properties: $properties,
            required: ['question'] // Only 'question' is required
        );

        // Define the tool using the Tool type
        $askTool = new Tool(
            name: 'project_ask',
            description: trim($detailedDescription),
            inputSchema: $inputSchema
        );

        // Return the result using ListToolsResult
        return new ListToolsResult(tools: [$askTool]);
    }

    /**
     * Handles the 'tools/call' request for 'project_ask'.
     *
     * @param  CallToolRequestParams  $params  Typed parameters from the SDK.
     * @param  string  $serverWorkingDirectory  The project directory context.
     * @param  \Psr\Log\LoggerInterface  $logger  Logger instance.
     *
     * @throws McpError For user-facing errors during tool execution.
     */
    public function handleToolsCall(CallToolRequestParams $params, string $serverWorkingDirectory, \Psr\Log\LoggerInterface $logger): CallToolResult
    {
        $toolName = $params->name;
        $args = (array) ($params->arguments ?? []); // Cast arguments (which are stdClass) to array

        $logger->info("Handling 'tools/call' request for tool: {$toolName}");
        $logger->debug('Arguments received: '.json_encode($args));

        if ($toolName !== 'project_ask') {
            $logger->error("Unsupported tool called: {$toolName}");
            // Throw an McpError for standard JSON-RPC error response
            throw new McpError(new McpErrorData(
                code: -32601, // Method not found / Invalid method
                message: 'Unsupported tool: '.$toolName
            ));
        }

        try {
            // Delegate to the MCPService
            // The service should return the structure needed for CallToolResult
            $serviceResult = $this->mcpService->handleProjectAsk($args, $serverWorkingDirectory);

            // Check if this is a streaming request
            if (isset($serviceResult['streaming_request']) && $serviceResult['streaming_request'] === true) {
                // Handle streaming
                return $this->handleStreamingResponse($serviceResult, $logger);
            }

            // $serviceResult should look like:
            // [
            //   'content' => [ ['type' => 'text', 'text' => 'The answer...'] ],
            //   'isError' => false,
            //   '_meta' => ['state_key' => '...'] // Optional
            // ]

            // Create Content objects (e.g., TextContent) from service result
            $contentObjects = [];
            if (isset($serviceResult['content']) && is_array($serviceResult['content'])) {
                foreach ($serviceResult['content'] as $contentData) {
                    if (isset($contentData['type']) && $contentData['type'] === 'text' && isset($contentData['text'])) {
                        $contentObjects[] = new TextContent(text: $contentData['text']);
                    }
                    // Add handling for other content types (ImageContent, etc.) if your service returns them
                }
            }

            // Extract metadata if present
            $meta = null;
            if (isset($serviceResult['_meta']) && is_array($serviceResult['_meta'])) {
                $meta = new \Mcp\Types\Meta;
                foreach ($serviceResult['_meta'] as $key => $value) {
                    $meta->$key = $value;
                }
            }

            $logger->info("Successfully processed 'project_ask' tool call.");

            return new CallToolResult(
                content: $contentObjects,
                isError: $serviceResult['isError'] ?? false,
                _meta: $meta
            );

        } catch (\InvalidArgumentException $e) {
            $logger->error("Invalid arguments for tool '{$toolName}': ".$e->getMessage());
            throw new McpError(new McpErrorData(code: -32602, message: 'Invalid arguments: '.$e->getMessage()), $e); // Invalid Params
        } catch (\Throwable $e) {
            // Catch any other exception from the service
            $logger->error("Error executing tool '{$toolName}': ".$e->getMessage());

            // Return CallToolResult with error flag and message
            return new CallToolResult(
                content: [new TextContent(text: 'Error processing tool: '.$e->getMessage())],
                isError: true
            );
            // OR: Rethrow as an McpError for a standard JSON-RPC error response
            // throw new McpError(new McpErrorData(code: -32000, message: "Internal server error during tool execution: " . $e->getMessage()), $e);
        }
    }

    // --- Notification Handlers ---

    /**
     * Handles the 'initialized' notification from the client.
     * The SDK automatically manages initialization state but allows custom handling.
     *
     * @param  Mcp\Types\InitializedNotification  $notification  Typed notification object.
     */
    public function handleNotificationInitialized(\Mcp\Types\InitializedNotification $notification): void
    {
        Log::channel('mcp')->info('Client acknowledged initialization.');
        // Perform any actions needed after client confirms initialization
    }

    /**
     * Handles the '$/cancelRequest' notification.
     *
     * @param  Mcp\Types\CancelledNotification  $notification  Typed notification object.
     */
    public function handleNotificationCancel(\Mcp\Types\CancelledNotification $notification): void
    {
        $cancelledRequestId = $notification->requestId->getValue();
        Log::channel('mcp')->info('Received request cancellation for ID: '.($cancelledRequestId ?? 'null'));
        // Implement logic to cancel the corresponding server-side operation if possible/needed.
    }

    /*
    // Optional: Handle 'exit' notification if needed
    public function handleNotificationExit($notification): void
    {
        Log::channel('mcp')->info("Received 'exit' notification. Preparing to shut down.");
        // Perform cleanup before the ServerRunner loop terminates
        // Note: The ServerRunner might stop automatically on STDIN close.
    }
    */

    /**
     * Handles streaming response for the project_ask tool.
     *
     * @param  array  $streamingData  The streaming request data from MCPService.
     * @param  \Psr\Log\LoggerInterface  $logger  Logger instance.
     */
    protected function handleStreamingResponse(array $streamingData, \Psr\Log\LoggerInterface $logger): CallToolResult
    {
        $questionService = resolve(ProjectQuestionService::class);
        $stateService = resolve(ConversationStateService::class);

        try {
            // Get the stream generator
            $stream = $questionService->askQuestionStream(
                $streamingData['copytreeOutput'],
                $streamingData['question'],
                $streamingData['history'],
                $streamingData['providerName'],
                $streamingData['modelNameString']
            );

            // Process the stream and accumulate the response
            $fullResponseText = '';
            $inputTokens = 0;
            $outputTokens = 0;
            $cachedInputTokens = 0;

            $lastChunk = null;
            foreach ($stream as $chunk) {
                $text = $chunk->text ?? '';
                if (!empty($text)) {
                    $fullResponseText .= $text;
                }
                $lastChunk = $chunk;

                // Check if this chunk has usage data in additionalContent
                if (isset($chunk->additionalContent['usage'])) {
                    $usage = $chunk->additionalContent['usage'];
                    if (is_object($usage)) {
                        $inputTokens = $usage->promptTokens ?? $inputTokens;
                        $outputTokens = $usage->completionTokens ?? $outputTokens;
                        $cachedInputTokens = $usage->cacheReadInputTokens ?? $cachedInputTokens;
                    }
                }
            }
            
            // Handle additional usage data from streaming mode if we didn't get it from chunks
            if ($inputTokens === 0 && $outputTokens === 0 && isset($lastChunk) && !empty($lastChunk->additionalContent)) {
                // Check for usage in additionalContent (some providers may put it here)
                if (isset($lastChunk->additionalContent['usage']) && is_object($lastChunk->additionalContent['usage'])) {
                    $usage = $lastChunk->additionalContent['usage'];
                    $inputTokens = $usage->promptTokens ?? 0;
                    $outputTokens = $usage->completionTokens ?? 0;
                    $cachedInputTokens = $usage->cacheReadInputTokens ?? 0;
                }
                // Some providers might include raw usage data
                elseif (isset($lastChunk->additionalContent['promptTokens'])) {
                    $inputTokens = $lastChunk->additionalContent['promptTokens'] ?? 0;
                    $outputTokens = $lastChunk->additionalContent['completionTokens'] ?? 0;
                    $cachedInputTokens = $lastChunk->additionalContent['cacheReadInputTokens'] ?? 0;
                }
            }

            // Save to conversation history
            $stateKey = $streamingData['stateKey'];
            $stateService->saveMessage($stateKey, 'user', $streamingData['question']);
            $stateService->saveMessage($stateKey, 'assistant', $fullResponseText);

            // Calculate cost
            $modelSize = $this->mcpService->getModelSizeFromString($streamingData['providerName'], $streamingData['modelNameString']);
            $costResult = $this->mcpService->calculateCost(
                $streamingData['providerName'],
                $streamingData['modelNameString'],
                $inputTokens,
                $outputTokens,
                $cachedInputTokens
            );

            // Build the response payload
            $responsePayload = $this->mcpService->buildResponsePayload(
                $fullResponseText,
                $stateKey,
                $inputTokens,
                $outputTokens,
                $cachedInputTokens,
                $costResult['totalCost'],
                $costResult['pricingFound'],
                $costResult['pricesAvailable']
            );

            // Create Content objects from service result
            $contentObjects = [];
            if (isset($responsePayload['content']) && is_array($responsePayload['content'])) {
                foreach ($responsePayload['content'] as $contentData) {
                    if (isset($contentData['type']) && $contentData['type'] === 'text' && isset($contentData['text'])) {
                        $contentObjects[] = new TextContent(text: $contentData['text']);
                    }
                }
            }

            // Extract metadata if present
            $meta = null;
            if (isset($responsePayload['_meta']) && is_array($responsePayload['_meta'])) {
                $meta = new \Mcp\Types\Meta;
                foreach ($responsePayload['_meta'] as $key => $value) {
                    $meta->$key = $value;
                }
            }

            $logger->info("Successfully processed 'project_ask' tool call with streaming.");

            return new CallToolResult(
                content: $contentObjects,
                isError: false,
                _meta: $meta
            );

        } catch (\Exception $e) {
            $logger->error("Error during streaming response: {$e->getMessage()}");

            return new CallToolResult(
                content: [new TextContent(text: 'Error processing streaming response: '.$e->getMessage())],
                isError: true
            );
        }
    }
}
