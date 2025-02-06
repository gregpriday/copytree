<?php

namespace Tests\Unit\Commands;

use App\Services\GitHubUrlHandler;
use Illuminate\Support\Facades\Cache;
use Mockery;
use Tests\TestCase;

class ClearCacheCommandTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_handle_success()
    {
        // Expect the Laravel cache to be flushed.
        Cache::shouldReceive('flush')
            ->once()
            ->andReturnTrue();

        // Mock the static method cleanCache() of GitHubUrlHandler.
        $githubMock = Mockery::mock('alias:App\Services\GitHubUrlHandler');
        $githubMock->shouldReceive('cleanCache')
            ->once()
            ->andReturnNull();

        // Run the command and assert it exits with code 0.
        $this->artisan('cache:clear')->assertExitCode(0);
    }

    public function test_handle_failure()
    {
        // Simulate an exception when flushing the cache.
        Cache::shouldReceive('flush')
            ->once()
            ->andThrow(new \Exception('Test exception'));

        // Run the command and assert it exits with code 1.
        $this->artisan('cache:clear')->assertExitCode(1);
    }
}
