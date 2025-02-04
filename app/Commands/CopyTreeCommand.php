<?php

namespace App\Commands;

use Illuminate\Console\Scheduling\Schedule;
use LaravelZero\Framework\Commands\Command;

class CopyTreeCommand extends Command
{
    /**
     * The signature of the command.
     *
     * @var string
     */
    protected $signature = 'copy {source}';

    /**
     * The description of the command.
     *
     * @var string
     */
    protected $description = 'The main copytree command';

    /**
     * Execute the console command.
     */
    public function handle(): void
    {
    }

    /**
     * Define the command's schedule.
     */
    public function schedule(Schedule $schedule): void
    {
    }
}
