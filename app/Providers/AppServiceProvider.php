<?php

namespace App\Providers;

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
        $this->app->bind(FileTransformer::class, function ($app) {
            return new FileTransformer(
                config('profile.transforms', [])
            );
        });
    }
}
