<?php

use Monolog\Handler\NullHandler;
use Monolog\Handler\StreamHandler;

// Removed unused: SyslogUdpHandler, PsrLogMessageProcessor

return [

    /*
    |--------------------------------------------------------------------------
    | Default Log Channel
    |--------------------------------------------------------------------------
    |
    | This option defines the default log channel that gets used when writing
    | messages to the logs. The name specified in this option should match
    | one of the channels defined in the "channels" configuration array.
    |
    */
    // Updated default channel to 'daily'
    'default' => env('LOG_CHANNEL', 'daily'),

    /*
    |--------------------------------------------------------------------------
    | Deprecations Log Channel
    |--------------------------------------------------------------------------
    |
    | This option controls the log channel that should be used to log warnings
    | regarding deprecated PHP and library features. This allows you to get
    | granular control over managing depreciation warnings in your logs.
    |
    */
    'deprecations' => [
        // Kept pointing to 'null' by default
        'channel' => env('LOG_DEPRECATIONS_CHANNEL', 'null'),
        'trace' => env('LOG_DEPRECATIONS_TRACE', false),
    ],

    /*
    |--------------------------------------------------------------------------
    | Log Channels
    |--------------------------------------------------------------------------
    |
    | Here you may configure the log channels for your application. Out of
    | the box, Laravel uses the Monolog PHP logging library. This gives
    | you a variety of powerful log handlers / formatters to utilize.
    |
    | Available Drivers: "single", "daily", "slack", "syslog",
    |                    "errorlog", "monolog",
    |                    "custom", "stack"
    |
    */
    'channels' => [

        // Kept 'daily' channel
        'daily' => [
            'driver' => 'daily',
            'path' => storage_path('logs/copytree.log'),
            'level' => env('LOG_LEVEL', 'info'), // Default level set to 'info'
            'days' => env('LOG_RETENTION_DAYS', 14),
            'permission' => 0644,
            'replace_placeholders' => true,
        ],

        // Kept 'console_debug' channel for --debug flag functionality
        'console_debug' => [
            'driver' => 'monolog',
            'handler' => StreamHandler::class,
            'formatter' => Monolog\Formatter\LineFormatter::class,
            'formatter_with' => [
                'format' => "[%datetime%] %level_name%: %message% %context% %extra%\n",
                'dateFormat' => 'H:i:s.u',
                'allowInlineLineBreaks' => true,
                'includeStacktraces' => false, // Keep false for CLI tool clarity
            ],
            'with' => [
                'stream' => 'php://stderr',
            ],
            'level' => 'debug', // Explicitly set to debug
        ],

        // Kept minimal 'null' channel for deprecations default
        'null' => [
            'driver' => 'monolog',
            'handler' => NullHandler::class,
        ],
    ],

];
