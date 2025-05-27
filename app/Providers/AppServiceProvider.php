<?php

namespace App\Providers;

use App\Renderer\SizeReportRenderer;
use App\Services\ConfigValidator;
use App\Transforms\FileTransformer;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\ServiceProvider;
use InvalidArgumentException;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Validate application configuration
        try {
            $validator = $this->app->make(ConfigValidator::class);
            $validator->validateApplicationConfig();
        } catch (InvalidArgumentException $e) {
            Log::error('Configuration validation failed: '.$e->getMessage());
            // We don't want to halt the application, just log the error
            // In a production environment, you might want to add more robust handling
        }
    }

    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Register the config validator service
        $this->app->singleton(ConfigValidator::class, function ($app) {
            return new ConfigValidator;
        });

        $this->app->singleton(FileTransformer::class, function ($app) {
            return new FileTransformer(
                config('profile.transforms', [])
            );
        });

        $this->app->singleton(SizeReportRenderer::class, function ($app) {
            return new SizeReportRenderer(
                $app->make(FileTransformer::class)
            );
        });
    }
}
