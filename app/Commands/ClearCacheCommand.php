<?php

namespace App\Commands;

use App\Services\GitHubUrlHandler;
use Illuminate\Support\Facades\Cache;
use LaravelZero\Framework\Commands\Command;

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
            $this->error('Error clearing caches: '.$e->getMessage());

            return self::FAILURE;
        }
    }
}
