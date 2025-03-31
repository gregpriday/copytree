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

    /*
    |--------------------------------------------------------------------------
    | Gemini Models Configuration (Task-Based)
    |--------------------------------------------------------------------------
    |
    | Here you can configure the different Gemini models used by specific tasks
    | in the application. This approach focuses on allocating models based on
    | their specific use cases rather than their general capabilities.
    |
    | ask_model: Model used for the primary Copytree Ask functionality (answering complex questions)
    | expert_selector_model: Model for selecting the appropriate expert for a question
    | summarization_model: Cost-effective model for text summarization tasks
    | classification_model: Model for classification and filtering tasks
    | general_model: Default model for any task without a specific allocation
    |
    | You can customize these models by setting the corresponding environment
    | variables in your .env file.
    */

    // Task-specific model configurations
    'ask_model' => env('GEMINI_ASK_MODEL', 'gemini-2.5-pro-exp-03-25'),
    'expert_selector_model' => env('GEMINI_EXPERT_SELECTOR_MODEL', 'models/gemini-2.0-flash'),
    'summarization_model' => env('GEMINI_SUMMARIZATION_MODEL', 'models/gemini-2.0-flash-lite'),
    'classification_model' => env('GEMINI_CLASSIFICATION_MODEL', 'models/gemini-2.0-flash'),
    'general_model' => env('GEMINI_GENERAL_MODEL', 'models/gemini-2.0-flash'),
];
