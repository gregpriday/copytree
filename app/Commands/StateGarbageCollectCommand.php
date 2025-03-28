<?php

namespace App\Commands;

use App\Services\ConversationStateService;
use LaravelZero\Framework\Commands\Command;

class StateGarbageCollectCommand extends Command
{
    /**
     * The signature of the command.
     *
     * @var string
     */
    protected $signature = 'state:gc
        {--days= : Delete conversation history older than this many days. Default from config if not specified.}';

    /**
     * The description of the command.
     *
     * @var string
     */
    protected $description = 'Perform garbage collection on conversation state history.';

    /**
     * Execute the console command.
     */
    public function handle(ConversationStateService $stateService): int
    {
        $defaultDays = config('state.garbage_collection.default_days', 7);
        $days = $this->option('days') !== null ? (int) $this->option('days') : $defaultDays;
        
        if ($days <= 0) {
            $this->error('Please provide a positive number of days.');
            return self::FAILURE;
        }

        $this->info("Deleting conversation history older than {$days} days...");

        try {
            $deletedCount = $stateService->deleteOldStates($days);
            $this->info("Successfully deleted {$deletedCount} old history records.");
            return self::SUCCESS;
        } catch (\Exception $e) {
            $this->error("Failed to delete old history: " . $e->getMessage());
            return self::FAILURE;
        }
    }
} 