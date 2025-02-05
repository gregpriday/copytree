<?php

namespace App\Commands;

use LaravelZero\Framework\Commands\Command;
use Illuminate\Support\Facades\Cache;
use App\Services\GitHubUrlHandler;

class ClearCacheCommand extends Command
{
    /**
     * The signature of the command.
     *
     * You can run this command using:
     *     php copytree cache:clear
     *
     * @var string
     */
    protected $signature = 'cache:clear';

    /**
     * The description of the command.
     *
     * @var string
     */
    protected $description = 'Clears the Laravel cache and the GitHubUrlHandler cache.';

    /**
     * Execute the console command.
     *
     * @return int
     */
    public function handle(): int
    {
        try {
            // Clear the Laravel cache.
            $this->info('Clearing Laravel cache...');
            Cache::flush();
            $this->info('Laravel cache cleared.');

            // Clear the GitHubUrlHandler cache.
            $this->info('Clearing GitHubUrlHandler cache...');
            GitHubUrlHandler::cleanCache();
            $this->info('GitHubUrlHandler cache cleared.');

            return self::SUCCESS;
        } catch (\Exception $e) {
            $this->error('Error clearing caches: ' . $e->getMessage());
            return self::FAILURE;
        }
    }
}
