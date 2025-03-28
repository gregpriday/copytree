<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Carbon\Carbon;
use Gemini\Laravel\Facades\Gemini;
use Gemini\Enums\Role;

class ConversationStateService
{
    protected string $connection = 'copytree_state';
    protected string $table = 'conversation_history';
    protected int $maxHistoryItems; // Number of most recent exchanges to load
    protected int $summaryMaxLength; // Max characters for summarized response
    
    /**
     * The summarization service instance.
     */
    protected SummarizationService $summarizationService;

    public function __construct(SummarizationService $summarizationService)
    {
        $this->summarizationService = $summarizationService;
        
        // Load configuration values
        $this->maxHistoryItems = config('state.history_limit', 10);
        $this->summaryMaxLength = config('state.summary_length', 500);
        
        $this->ensureDatabaseExists();
    }

    /**
     * Ensure the SQLite database file and table exist.
     */
    protected function ensureDatabaseExists(): void
    {
        $dbPath = config("database.connections.{$this->connection}.database");
        $dbDir = dirname($dbPath);

        if (!File::isDirectory($dbDir)) {
            File::makeDirectory($dbDir, 0755, true);
        }

        if (!File::exists($dbPath)) {
            File::put($dbPath, ''); // Create the file
        }

        try {
            // Use the specific connection
            $pdo = DB::connection($this->connection)->getPdo();
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS {$this->table} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    state_key TEXT NOT NULL,
                    role TEXT NOT NULL CHECK(role IN ('user', 'model')),
                    content TEXT NOT NULL,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            ");
            $pdo->exec("CREATE INDEX IF NOT EXISTS idx_state_key ON {$this->table} (state_key);");
            $pdo->exec("CREATE INDEX IF NOT EXISTS idx_timestamp ON {$this->table} (timestamp);");
        } catch (\Exception $e) {
            throw new \RuntimeException("Failed to ensure database table exists: " . $e->getMessage());
        }
    }

    /**
     * Generate a unique state key.
     * Creates a short 8-character hexadecimal identifier.
     */
    public function generateStateKey(): string
    {
        // Generate a random 8-character hexadecimal string
        return strtolower(substr(md5(uniqid(mt_rand(), true)), 0, 8));
    }

    /**
     * Load conversation history for a given state key.
     * Returns an array formatted for Gemini history (alternating roles).
     */
    public function loadHistory(string $stateKey): array
    {
        $messages = DB::connection($this->connection)
            ->table($this->table)
            ->where('state_key', $stateKey)
            ->orderBy('timestamp', 'asc')
            // Limit the number of messages retrieved to prevent overly long prompts
            ->limit($this->maxHistoryItems * 2) // *2 because each interaction is 2 messages
            ->get(['role', 'content'])
            ->toArray();

        // Format history for Gemini
        $formattedHistory = [];
        foreach ($messages as $message) {
            $formattedHistory[] = [
                'role' => $message->role, 
                'content' => $message->content
            ];
        }

        // If history is too long, take only the most recent items
        if (count($formattedHistory) > $this->maxHistoryItems * 2) {
            $formattedHistory = array_slice($formattedHistory, -$this->maxHistoryItems * 2);
        }

        return $formattedHistory;
    }

    /**
     * Save a message (question or summarized response) to the history.
     */
    public function saveMessage(string $stateKey, string $role, string $content): void
    {
        // Ensure role is a valid string value (either 'user' or 'model')
        $validRole = $role;
        if ($role instanceof Role) {
            $validRole = $role->value;
        }

        // Summarize model responses before saving
        $saveContent = $content;
        if ($validRole === 'model') {
            try {
                $saveContent = $this->summarizeResponse($content);
                
                // Only wrap in XML tags if the content was actually summarized
                if ($saveContent !== $content) {
                    $saveContent = "<ct:summary>{$saveContent}</ct:summary>";
                }
            } catch (\Exception $e) {
                // Log the error and save the truncated original content as fallback
                \Illuminate\Support\Facades\Log::error("Failed to summarize response for state {$stateKey}: " . $e->getMessage());
                $saveContent = Str::limit($content, $this->summaryMaxLength, '...');
                // Mark truncated content as well
                $saveContent = "<ct:truncated>{$saveContent}</ct:truncated>";
            }
        }

        DB::connection($this->connection)->table($this->table)->insert([
            'state_key' => $stateKey,
            'role' => $validRole,
            'content' => $saveContent, // Save summarized or original content
            'timestamp' => Carbon::now(),
        ]);
    }

    /**
     * Summarize the AI's response using the SummarizationService.
     */
    protected function summarizeResponse(string $fullResponse): string
    {
        return $this->summarizationService->summarizeText($fullResponse, $this->summaryMaxLength);
    }

    /**
     * Delete conversation history older than a specified number of days.
     * If no days are specified, uses the default from configuration.
     */
    public function deleteOldStates(int $days = null): int
    {
        $daysToKeep = $days ?? config('state.garbage_collection.default_days', 7);
        $cutoffDate = Carbon::now()->subDays($daysToKeep)->toDateTimeString();

        return DB::connection($this->connection)
            ->table($this->table)
            ->where('timestamp', '<', $cutoffDate)
            ->delete();
    }
} 