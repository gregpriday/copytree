<?php

namespace App\Providers;

use App\Services\JinaCodeSearch;
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
        $this->app->singleton(JinaCodeSearch::class, function ($app) {
            $jinaConfig = config('services.jina');
            if (empty($jinaConfig['api_key'])) {
                throw new \RuntimeException('JINA_API_KEY not configured in config/services.php');
            }
            return new JinaCodeSearch($jinaConfig['api_key'], 1000, 20, 0.8);
        });

        $this->app->bind(FileTransformer::class, function ($app) {
            return new FileTransformer(
                config('profile.transforms', [])
            );
        });
    }
}
