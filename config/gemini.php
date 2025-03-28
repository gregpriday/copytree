<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | Gemini API Key
    |--------------------------------------------------------------------------
    |
    | Here you may specify your Gemini API Key and organization. This will be
    | used to authenticate with the Gemini API - you can find your API key
    | on Google AI Studio, at https://makersuite.google.com.
    */

    'api_key' => env('GEMINI_API_KEY'),

    /*
    |--------------------------------------------------------------------------
    | Gemini Base URL
    |--------------------------------------------------------------------------
    |
    | If you need a specific base URL for the Gemini API, you can provide it here.
    | Otherwise, leave empty to use the default value.
    */
    'base_url' => env('GEMINI_BASE_URL'),

    /*
    |--------------------------------------------------------------------------
    | Request Timeout
    |--------------------------------------------------------------------------
    |
    | The timeout may be used to specify the maximum number of seconds to wait
    | for a response. By default, the client will time out after 30 seconds.
    */

    'request_timeout' => env('GEMINI_REQUEST_TIMEOUT', 120),

    'model' => env('GEMINI_MODEL', 'models/gemini-2.0-flash'),
    'model_pro' => env('GEMINI_MODEL_PRO', 'gemini-2.5-pro-exp-03-25'),
    'model_thinking' => env('GEMINI_MODEL_THINKING', 'gemini-2.0-flash-thinking-exp-01-21'),
    'model_flash' => env('GEMINI_MODEL_FLASH', 'models/gemini-2.0-flash'),
];
