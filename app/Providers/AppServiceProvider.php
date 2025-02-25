<?php

namespace App\Providers;

use App\Renderer\SizeReportRenderer;
use App\Transforms\FileTransformer;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }

    /**
     * Register any application services.
     */
    public function register(): void
    {
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
