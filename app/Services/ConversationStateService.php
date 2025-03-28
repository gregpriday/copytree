<?php

namespace App\Services;

use Carbon\Carbon;
use Exception;
use Gemini\Enums\Role;
use Gemini\Laravel\Facades\Gemini;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use PDOException;
use RuntimeException;

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
     * Ensure the SQLite database file exists and has the necessary tables.
     * This method will:
     * 1. Check if the database directory exists, create if not
     * 2. Check if the database file exists, create if not
     * 3. Check if the conversation_history table exists, run migrations if not
     */
    protected function ensureDatabaseExists(): void
    {
        $dbPath = config("database.connections.{$this->connection}.database");
        $dbDir = dirname($dbPath);
        $dbFileExisted = File::exists($dbPath);
        $runMigrations = false;

        // Ensure the directory exists
        if (! File::isDirectory($dbDir)) {
            try {
                File::makeDirectory($dbDir, 0755, true);
            } catch (Exception $e) {
                throw new RuntimeException("Failed to create state database directory at {$dbDir}: ".$e->getMessage());
            }
        }

        // Ensure the SQLite database file exists
        if (! $dbFileExisted) {
            try {
                File::put($dbPath, ''); // Create the empty file
                $runMigrations = true; // Need to run migrations for a new file
            } catch (Exception $e) {
                throw new RuntimeException("Failed to create state database file at {$dbPath}: ".$e->getMessage());
            }
        } else {
            // Check if the table exists in an existing database file
            try {
                if (! Schema::connection($this->connection)->hasTable($this->table)) {
                    $runMigrations = true; // Table doesn't exist, need to run migrations
                }
            } catch (PDOException $e) {
                // Catch PDO exceptions which might occur if the file is corrupt or not a valid DB
                Log::warning("Error checking state database table '{$this->table}': ".$e->getMessage().'. Attempting migration.');
                $runMigrations = true;
            }
        }

        // Run migrations if needed (new file or missing tables)
        if ($runMigrations) {
            Log::info("State database file or table '{$this->table}' missing or check failed. Running migrations...");
            try {
                Artisan::call('migrate', [
                    '--database' => $this->connection,
                    '--path' => 'database/migrations', // Be explicit about the path
                    '--force' => true, // Force in production environments
                ]);
                Log::info('State database migrations completed successfully.');

                // Verify table exists after migration attempt
                if (! Schema::connection($this->connection)->hasTable($this->table)) {
                    throw new RuntimeException("Migrations ran but table '{$this->table}' still not found. Check migration files and permissions.");
                }
            } catch (Exception $e) {
                Log::error('Failed to run migrations for state database: '.$e->getMessage());
                throw new RuntimeException(
                    'Failed to automatically set up the state database tables. '.
                    'Please check logs and ensure migrations can run. Error: '.$e->getMessage()
                );
            }
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
        try {
            $messages = DB::connection($this->connection)
                ->table($this->table)
                ->where('state_key', $stateKey)
                ->orderBy('id', 'asc') // Order by id for reliable chronological ordering
                // Limit the number of messages retrieved to prevent overly long prompts
                ->limit($this->maxHistoryItems * 2) // *2 because each interaction is 2 messages
                ->get(['role', 'content'])
                ->toArray();

            // Format history for Gemini
            $formattedHistory = [];
            foreach ($messages as $message) {
                $formattedHistory[] = [
                    'role' => $message->role,
                    'content' => $message->content,
                ];
            }

            // If history is too long, take only the most recent items
            if (count($formattedHistory) > $this->maxHistoryItems * 2) {
                $formattedHistory = array_slice($formattedHistory, -$this->maxHistoryItems * 2);
            }

            return $formattedHistory;
        } catch (QueryException $e) {
            // Log the error and return empty array
            Log::error("Database error loading history for state {$stateKey}: ".$e->getMessage());

            return [];
        }
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
            } catch (Exception $e) {
                // Log the error and save the truncated original content as fallback
                Log::error("Failed to summarize response for state {$stateKey}: ".$e->getMessage());
                $saveContent = Str::limit($content, $this->summaryMaxLength, '...');
                // Mark truncated content as well
                $saveContent = "<ct:truncated>{$saveContent}</ct:truncated>";
            }
        }

        try {
            DB::connection($this->connection)->table($this->table)->insert([
                'state_key' => $stateKey,
                'role' => $validRole,
                'content' => $saveContent, // Save summarized or original content
                'timestamp' => Carbon::now(),
            ]);
        } catch (QueryException $e) {
            Log::error("Database error saving message for state {$stateKey}: ".$e->getMessage());
            throw $e;
        }
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
    public function deleteOldStates(?int $days = null): int
    {
        $daysToKeep = $days ?? config('state.garbage_collection.default_days', 7);
        $cutoffDate = Carbon::now()->subDays($daysToKeep)->toDateTimeString();

        try {
            return DB::connection($this->connection)
                ->table($this->table)
                ->where('timestamp', '<', $cutoffDate)
                ->delete();
        } catch (QueryException $e) {
            // Log the error but don't halt execution for GC failure
            Log::warning('Database error during state garbage collection: '.$e->getMessage());

            return 0; // Indicate no rows were deleted
        }
    }
}
