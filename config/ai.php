<?php

return [
    /*
    |--------------------------------------------------------------------------
    | AI Provider Configuration
    |--------------------------------------------------------------------------
    |
    | This section contains provider-specific configurations for AI services.
    | You can specify your API keys, base URLs, and other provider-specific
    | settings here.
    |
    */
    'providers' => [
        'fireworks' => [
            'key' => env('FIREWORKS_API_KEY'),
            'base_url' => env('FIREWORKS_API_BASE_URL', 'https://api.fireworks.ai/inference/v1'),
            'timeout' => env('FIREWORKS_REQUEST_TIMEOUT', 120),

            'models' => [
                'medium' => 'accounts/fireworks/models/llama4-maverick-instruct-basic',
                'flash' => 'accounts/fireworks/models/llama4-scout-instruct-basic',
            ]
        ],

        'lambda' => [
            'key' => env('LAMBDA_API_KEY'),
            'base_url' => env('LAMBDA_API_BASE_URL', 'https://api.lambda.ai/v1'),
            'timeout' => env('LAMBDA_REQUEST_TIMEOUT', 120),

            'models' => [
                'medium' => 'llama-4-maverick-17b-128e-instruct-fp8',
                'flash' => 'llama-4-scout-17b-16e-instruct',
            ]
        ],

        'openai' => [
            'key' => env('OPENAI_API_KEY'),
            'base_url' => env('OPENAI_API_BASE_URL', 'https://api.openai.com/v1'),
            'timeout' => env('OPENAI_REQUEST_TIMEOUT', 120),
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Default Provider
    |--------------------------------------------------------------------------
    |
    | This option defines the default AI provider that will be used when an
    | explicit provider is not specified. This should be one of the keys in
    | the providers array above.
    |
    */
    'default_provider' => env('AI_DEFAULT_PROVIDER', 'lambda'),

    /*
    |--------------------------------------------------------------------------
    | Models Configuration
    |--------------------------------------------------------------------------
    |
    | Here you can define the different models to use for various AI tasks.
    | Each task can use a different model optimized for that specific purpose.
    |
    */
    'models' => [
        // Default model used when no specific model is specified
        'default' => env('AI_DEFAULT_MODEL', 'accounts/fireworks/models/llama4-maverick-instruct-basic'),

        // Model for the ask command
        'ask' => env('AI_ASK_MODEL', 'accounts/fireworks/models/llama4-maverick-instruct-basic'),

        // Model for expert selection
        'expert_selector' => env('AI_EXPERT_SELECTOR_MODEL', 'accounts/fireworks/models/llama4-maverick-instruct-basic'),

        // Model for summarization
        'summarization' => env('AI_SUMMARIZATION_MODEL', 'accounts/fireworks/models/llama4-maverick-instruct-basic'),

        // Model for classification
        'classification' => env('AI_CLASSIFICATION_MODEL', 'accounts/fireworks/models/llama4-maverick-instruct-basic'),

        // Model for general purpose tasks
        'general' => env('AI_GENERAL_MODEL', 'accounts/fireworks/models/llama4-maverick-instruct-basic'),

        // Model for file content filtering
        'filter' => env('AI_FILTER_MODEL', 'accounts/fireworks/models/llama4-maverick-instruct-basic'),

        // Model for filename generation
        'filename_generator' => env('AI_FILENAME_MODEL', 'accounts/fireworks/models/llama4-maverick-instruct-basic'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Model Parameters
    |--------------------------------------------------------------------------
    |
    | Default parameters to use with LLM API calls. These can be overridden
    | on a per-request basis, but provide sane defaults for most use cases.
    |
    */
    'parameters' => [
        'temperature' => env('AI_DEFAULT_TEMPERATURE', 0.7),
        'max_tokens' => env('AI_DEFAULT_MAX_TOKENS', 2048),
        'top_p' => env('AI_DEFAULT_TOP_P', 0.9),
        'stream' => env('AI_DEFAULT_STREAM', true),
    ],

    /*
    |--------------------------------------------------------------------------
    | Task-Specific Parameters
    |--------------------------------------------------------------------------
    |
    | Override default parameters for specific tasks that may require
    | different settings.
    |
    */
    'task_parameters' => [
        'summarization' => [
            'temperature' => env('AI_SUMMARIZATION_TEMPERATURE', 0.3),
            'max_tokens' => env('AI_SUMMARIZATION_MAX_TOKENS', 1024),
        ],
        'classification' => [
            'temperature' => env('AI_CLASSIFICATION_TEMPERATURE', 0.2),
            'max_tokens' => env('AI_CLASSIFICATION_MAX_TOKENS', 256),
        ],
        'expert_selection' => [
            'temperature' => env('AI_EXPERT_SELECTION_TEMPERATURE', 0.2),
            'max_tokens' => env('AI_EXPERT_SELECTION_MAX_TOKENS', 256),
        ],
        'filename_generation' => [
            'temperature' => env('AI_FILENAME_TEMPERATURE', 0.5),
            'max_tokens' => env('AI_FILENAME_MAX_TOKENS', 128),
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Prompts Configuration
    |--------------------------------------------------------------------------
    |
    | Paths to prompt templates used for different AI tasks. These templates
    | will be loaded from the specified paths.
    |
    */
    'prompts' => [
        'experts_dir' => resource_path('prompts/experts'),
        'summarization' => resource_path('prompts/summarization.md'),
        'expert_selector' => resource_path('prompts/expert_selector.md'),
        'filter' => resource_path('prompts/filter.md'),
        'filename_generator' => resource_path('prompts/filename_generator.md'),
    ]
];
