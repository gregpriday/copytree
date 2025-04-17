<?php

namespace App\Commands;

use LaravelZero\Framework\Commands\Command;
use App\Services\MCPService;
// Remove ProjectQuestionService and ConversationStateService if MCPService handles them
// use App\Services\ProjectQuestionService;
// use App\Services\ConversationStateService;
use Illuminate\Contracts\Config\Repository as ConfigContract;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;

// --- MCP SDK Imports ---
use Mcp\Server\Server;
use Mcp\Server\ServerRunner;
use Mcp\Server\InitializationOptions;
use Mcp\Types\ServerCapabilities;
use Mcp\Types\ServerToolsCapability;
use Mcp\Types\InitializeResult;
use Mcp\Types\Implementation;
use Mcp\Types\PingRequest; // Although PingRequest is used client-side, we check the method name 'ping'
use Mcp\Types\EmptyResult;
use Mcp\Types\ListToolsResult;
use Mcp\Types\Tool;
use Mcp\Types\ToolInputSchema;
use Mcp\Types\ToolInputProperties;
use Mcp\Types\CallToolRequestParams;
use Mcp\Types\CallToolResult;
use Mcp\Types\TextContent;
use Mcp\Types\PaginatedRequestParams;
use Mcp\Shared\ErrorData as McpErrorData;
use Mcp\Shared\McpError;
// --- End MCP SDK Imports ---

class McpCommand extends Command
{
    /**
     * The signature of the command.
     * @var string
     */
    protected $signature = 'mcp {directory?}';

    /**
     * The description of the command.
     * @var string
     */
    protected $description = 'Starts the CopyTree MCP server using the MCP SDK library.';

    /**
     * The configuration repository instance.
     *
     * @var ConfigContract
     */
    protected ConfigContract $config;

    /**
     * The MCP service instance.
     *
     * @var MCPService
     */
    protected MCPService $mcpService;

    /**
     * Create a new McpCommand instance.
     *
     * @param ConfigContract $config
     * @param MCPService $mcpService
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
     *
     * @return int
     */
    public function handle(): int
    {
        // --- Determine Project Directory ---
        $serverWorkingDirectory = $this->argument('directory') ?? getcwd();
        if (!$serverWorkingDirectory || !is_dir($serverWorkingDirectory)) {
            Log::channel('mcp')->error("Invalid directory provided: " . ($serverWorkingDirectory ?: 'null'));
            $this->error("Invalid directory provided: " . ($serverWorkingDirectory ?: 'null'));
            return self::FAILURE;
        }

        // --- Initialize Logger ---
        // The SDK ServerRunner creates a default STDERR logger,
        // but we can pass Laravel's logger for consistent logging.
        $logger = Log::channel('mcp'); // Get the PSR-3 compliant logger instance

        $logger->info("Starting CopyTree MCP SDK Server for directory: " . $serverWorkingDirectory);

        try {
            // --- Configure MCP Server ---
            $server = new Server('copytree-mcp-server', $logger);

            // --- Register Request Handlers ---
            // $server->registerHandler('initialize', [$this, 'handleInitialize']); // Handled by SDK Session
            $server->registerHandler('ping', [$this, 'handlePing']);
            $server->registerHandler('tools/list', [$this, 'handleToolsList']);
            // Pass the working directory context to the handler
            $server->registerHandler('tools/call', function(CallToolRequestParams $params) use ($serverWorkingDirectory, $logger) {
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

            $logger->info("MCP Server Runner starting. Listening on STDIO...");
            $runner->run(); // This enters the main loop handled by the SDK

            $logger->info("MCP Server Runner finished.");
            return self::SUCCESS;

        } catch (\Throwable $e) {
            $logger->error("MCP Server crashed: " . $e->getMessage(), [
                'exception' => $e::class,
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString() // Be cautious logging full traces in production
            ]);
            $this->error("Server error: " . $e->getMessage());
            return self::FAILURE;
        }
    }

    // --- Handler Implementations ---

    /**
     * Handles the 'ping' request.
     * The SDK automatically uses this handler if registered.
     *
     * @param array|null $params Request parameters (should be null for ping).
     * @return EmptyResult
     */
    public function handlePing(?array $params): EmptyResult
    {
        Log::channel('mcp')->debug("Handling 'ping' request.");
        return new EmptyResult(); // Return the specific EmptyResult type
    }

    /**
     * Handles the 'tools/list' request.
     *
     * @param PaginatedRequestParams|null $params Request parameters (e.g., pagination cursor, unused here).
     * @return ListToolsResult
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
                Log::channel('mcp')->warning("Failed to load tool description from {$descriptionFilePath}: " . $e->getMessage());
            }
        } else {
            Log::channel('mcp')->warning("Tool description file not found: {$descriptionFilePath}");
        }

        // Define properties using ToolInputProperties
        $properties = new ToolInputProperties();
        $properties->question = ['description' => 'The question to ask about the project.', 'type' => 'string'];
        $properties->state = ['description' => 'Optional *string* key to continue a previous conversation. Must be the exact key provided by a previous response. Omit or pass null/empty to start a new conversation.', 'type' => 'string'];
        $properties->{'ask-provider'} = ['description' => 'Override AI provider (e.g., openai). Defaults to config.', 'type' => 'string'];
        $properties->{'ask-model-size'} = ['description' => 'Override AI model size (small, medium, large). Defaults to config.', 'type' => 'string'];

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
     * @param CallToolRequestParams $params Typed parameters from the SDK.
     * @param string $serverWorkingDirectory The project directory context.
     * @param \Psr\Log\LoggerInterface $logger Logger instance.
     * @return CallToolResult
     * @throws McpError For user-facing errors during tool execution.
     */
    public function handleToolsCall(CallToolRequestParams $params, string $serverWorkingDirectory, \Psr\Log\LoggerInterface $logger): CallToolResult
    {
        $toolName = $params->name;
        $args = (array)($params->arguments ?? []); // Cast arguments (which are stdClass) to array

        $logger->info("Handling 'tools/call' request for tool: {$toolName}");
        $logger->debug("Arguments received: " . json_encode($args));

        if ($toolName !== 'project_ask') {
            $logger->error("Unsupported tool called: {$toolName}");
            // Throw an McpError for standard JSON-RPC error response
            throw new McpError(new McpErrorData(
                code: -32601, // Method not found / Invalid method
                message: "Unsupported tool: " . $toolName
            ));
        }

        try {
            // Delegate to the MCPService
            // The service should return the structure needed for CallToolResult
            $serviceResult = $this->mcpService->handleProjectAsk($args, $serverWorkingDirectory);

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
                $meta = new \Mcp\Types\Meta();
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
             $logger->error("Invalid arguments for tool '{$toolName}': " . $e->getMessage());
             throw new McpError(new McpErrorData(code: -32602, message: "Invalid arguments: " . $e->getMessage()), $e); // Invalid Params
        } catch (\Throwable $e) {
            // Catch any other exception from the service
            $logger->error("Error executing tool '{$toolName}': " . $e->getMessage());
            // Return CallToolResult with error flag and message
             return new CallToolResult(
                 content: [new TextContent(text: "Error processing tool: " . $e->getMessage())],
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
     * @param Mcp\Types\InitializedNotification $notification Typed notification object.
     */
    public function handleNotificationInitialized(\Mcp\Types\InitializedNotification $notification): void
    {
        Log::channel('mcp')->info("Client acknowledged initialization.");
        // Perform any actions needed after client confirms initialization
    }

     /**
     * Handles the '$/cancelRequest' notification.
     *
     * @param Mcp\Types\CancelledNotification $notification Typed notification object.
     */
    public function handleNotificationCancel(\Mcp\Types\CancelledNotification $notification): void
    {
        $cancelledRequestId = $notification->requestId->getValue();
        Log::channel('mcp')->info("Received request cancellation for ID: " . ($cancelledRequestId ?? 'null'));
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
}
