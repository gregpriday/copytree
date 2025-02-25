<?php

return [
    'default' => env('LOG_CHANNEL', 'stack'),
    'channels' => [
        'stack' => [
            'driver' => 'stack',
            'channels' => ['single'],
        ],
        'single' => [
            'driver' => 'single',
            'path' => storage_path('logs/laravel.log'),
            'level' => 'debug',
        ],
        'deprecations' => [
            'driver' => 'single',
            'path' => storage_path('logs/deprecations.log'),
            'level' => 'warning',
        ],
    ],
];
