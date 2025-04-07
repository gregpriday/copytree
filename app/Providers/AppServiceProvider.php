<?php

namespace App\Providers;

use App\Renderer\SizeReportRenderer;
use App\Transforms\FileTransformer;
use Illuminate\Support\ServiceProvider;
use OpenAI;
use OpenAI\Client;

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
        $this->app->singleton('fireworks', function(){
            return OpenAI::factory()
                ->withApiKey(config('fireworks.key'))
                ->withBaseUri('https://api.fireworks.ai/inference/v1')
                ->make();
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
