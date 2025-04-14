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
        'llama' => [
            'key' => env('GROQ_API_KEY'),
            'base_url' => env('GROQ_API_BASE_URL', 'https://api.groq.com/openai/v1'),
            'timeout' => env('GROQ_REQUEST_TIMEOUT', 120),

            'models' => [
                'medium' => 'meta-llama/llama-4-maverick-17b-128e-instruct',
                'small' => 'meta-llama/llama-4-scout-17b-16e-instruct',
            ]
        ],

        'gemini' => [
            'key' => env('GEMINI_API_KEY'),
            'base_url' => env('GEMINI_API_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta/openai'),
            'timeout' => env('GEMINI_REQUEST_TIMEOUT', 120),

            'models' => [
                'large' => 'gemini-2.5-pro-preview-03-25',
                'small' => 'gemini-2.0-flash',
            ]
        ],

        'openai' => [
            'key' => env('OPENAI_API_KEY'),
            'base_url' => env('OPENAI_API_BASE_URL', 'https://api.openai.com/v1'),
            'timeout' => env('OPENAI_REQUEST_TIMEOUT', 120),

            'models' => [
                'medium' => 'gpt-4.1-mini',
                'small' => 'gpt-4.1-nano',
            ]
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
    'default_provider' => env('AI_DEFAULT_PROVIDER', 'openai'),

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
