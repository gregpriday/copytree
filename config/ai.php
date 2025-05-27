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
        /*
         * Anthropic provider configuration.
         *
         * Anthropic supports prompt caching to reduce token usage and costs.
         * When enabled, cached tokens are tracked in the response:
         * - $response->usage->cacheCreationInputTokens: Tokens used to create cache
         * - $response->usage->cacheReadInputTokens: Tokens read from cache
         *
         * See: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
         */
        'anthropic' => [
            'api_key' => env('ANTHROPIC_API_KEY'),
            'url' => env('ANTHROPIC_URL', 'https://api.anthropic.com'),
            'models' => [
                'small' => env('ANTHROPIC_SMALL_MODEL', 'claude-3-haiku-20240307'),
                'medium' => env('ANTHROPIC_MEDIUM_MODEL', 'claude-3-sonnet-20240229'),
                'large' => env('ANTHROPIC_LARGE_MODEL', 'claude-3-opus-20240229'),
            ],
        ],

        'fireworks' => [
            'key' => env('FIREWORKS_API_KEY'),
            'base_url' => env('FIREWORKS_API_BASE_URL', 'https://api.fireworks.ai/inference/v1'),
            'timeout' => env('FIREWORKS_REQUEST_TIMEOUT', 120),

            'models' => [
                'large' => env('FIREWORKS_ASK_MODEL', 'accounts/fireworks/models/llama4-maverick-instruct-basic'),
                'medium' => env('FIREWORKS_CLASSIFICATION_MODEL', 'accounts/fireworks/models/llama-v3p1-8b-instruct'),
                'small' => env('FIREWORKS_SUMMARIZATION_MODEL', 'accounts/fireworks/models/llama-v3p1-8b-instruct'),
                'general' => env('FIREWORKS_GENERAL_MODEL', 'accounts/fireworks/models/llama4-maverick-instruct-basic'),
            ],

            'pricing' => [
                'large' => [
                    'input' => 0.20,  // Price per million input tokens
                    'output' => 0.60, // Price per million output tokens
                ],
                'medium' => [
                    'input' => 0.20,  // Price per million input tokens
                    'output' => 0.60, // Price per million output tokens
                ],
                'small' => [
                    'input' => 0.11,  // Price per million input tokens
                    'output' => 0.34, // Price per million output tokens
                ],
            ],
        ],

        'llama' => [
            'key' => env('GROQ_API_KEY'),
            'base_url' => env('GROQ_API_BASE_URL', 'https://api.groq.com/openai/v1'),
            'timeout' => env('GROQ_REQUEST_TIMEOUT', 120),

            'models' => [
                'medium' => 'meta-llama/llama-4-maverick-17b-128e-instruct',
                'small' => 'meta-llama/llama-4-scout-17b-16e-instruct',
            ],

            'pricing' => [
                'medium' => [
                    'input' => 0.20,  // Price per million input tokens
                    'output' => 0.60, // Price per million output tokens
                ],
                'small' => [
                    'input' => 0.11,  // Price per million input tokens
                    'output' => 0.34, // Price per million output tokens
                ],
            ],
        ],

        'gemini' => [
            'key' => env('GEMINI_API_KEY'),
            'base_url' => env('GEMINI_API_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta'), // Standard Gemini endpoint
            'timeout' => env('GEMINI_REQUEST_TIMEOUT', 120),

            'models' => [
                'large' => 'gemini-2.5-pro-preview-03-25', // Using gemini-2.5-pro-preview model name
                'medium' => 'gemini-2.5-flash-preview-05-20',           // Using gemini-2.5-flash-preview model name
                'small' => 'gemini-2.0-flash-lite',      // Using gemini-2.0-flash-lite model name
            ],

            'pricing' => [ // Prices from Google Gemini API (Paid Tier, per million tokens)
                'large' => [ // Corresponds to gemini-2.5-pro-preview (using <= 200k token tier)
                    'input' => 1.25,  // Price per million input tokens
                    'output' => 10.00, // Price per million output tokens (including thinking)
                ],
                'medium' => [ // Corresponds to gemini-2.5-flash (text pricing)
                    'input' => 0.15,  // Price per million input tokens (text)
                    'output' => 0.60, // Price per million output tokens
                    'cached_input' => 0.0375, // Price per million cached tokens (text/image/video)
                ],
                'small' => [ // Corresponds to gemini-2.0-flash-lite
                    'input' => 0.075, // Price per million input tokens
                    'output' => 0.30, // Price per million output tokens
                ],
            ],
        ],

        'openai' => [
            'key' => env('OPENAI_API_KEY'),
            'base_url' => env('OPENAI_API_BASE_URL', 'https://api.openai.com/v1'),
            'timeout' => env('OPENAI_REQUEST_TIMEOUT', 120),

            'models' => [
                'large' => 'gpt-4.1',
                'medium' => 'gpt-4.1-mini',
                'small' => 'gpt-4.1-nano',
            ],

            'pricing' => [
                'large' => [ // Corresponds to gpt-4.1
                    'input' => 2.00,  // Price per million tokens
                    'output' => 8.00, // Price per million tokens
                    'cached_input' => 0.50, // Price per million cached input tokens
                ],
                'medium' => [ // Corresponds to gpt-4.1-mini
                    'input' => 0.40,  // Price per million tokens
                    'output' => 1.60, // Price per million tokens
                    'cached_input' => 0.10, // Price per million cached input tokens
                ],
                'small' => [ // Corresponds to gpt-4.1-nano
                    'input' => 0.10,
                    'output' => 0.40,
                    'cached_input' => 0.025,
                ],
            ],
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
    'default_provider' => env('AI_DEFAULT_PROVIDER', 'fireworks'),

    /*
    |--------------------------------------------------------------------------
    | General AI Defaults
    |--------------------------------------------------------------------------
    |
    | Default provider and model settings that can be used across different
    | AI services. Individual services can override these as needed.
    |
    */
    'defaults' => [
        'temperature' => env('AI_DEFAULT_TEMPERATURE', 0.7),
        'model_size_for_summarization' => env('AI_SUMMARIZATION_MODEL_SIZE', 'small'),
        'model_size_for_image_description' => env('AI_IMAGE_DESCRIPTION_MODEL_SIZE', 'medium'),
        'model_size_for_classification' => env('AI_CLASSIFICATION_MODEL_SIZE', 'medium'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Ask Command Defaults
    |--------------------------------------------------------------------------
    |
    | Default provider and model size specifically for the 'ask' command.
    | These can be overridden by command-line options.
    |
    */
    'ask_defaults' => [
        'provider' => env('ASK_PROVIDER', 'gemini'),
        'model_size' => env('ASK_MODEL_SIZE', 'medium'),
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
            'temperature' => env('AI_SUMMARIZATION_TEMPERATURE', 0.2),
            'max_tokens' => env('AI_SUMMARIZATION_MAX_TOKENS', 512),
        ],
        'classification' => [
            'temperature' => env('AI_CLASSIFICATION_TEMPERATURE', 0.1),
            'max_tokens' => env('AI_CLASSIFICATION_MAX_TOKENS', 1024),
        ],
        'filename_generation' => [
            'temperature' => env('AI_FILENAME_TEMPERATURE', 0.3),
            'max_tokens' => env('AI_FILENAME_MAX_TOKENS', 50),
        ],
        'image_description' => [
            'temperature' => env('AI_IMAGE_DESCRIPTION_TEMPERATURE', 0.3),
            'max_tokens' => env('AI_IMAGE_DESCRIPTION_MAX_TOKENS', 256),
        ],
        'code_summary' => [
            'temperature' => env('AI_CODE_SUMMARY_TEMPERATURE', 0.2),
            'max_tokens' => env('AI_CODE_SUMMARY_MAX_TOKENS', 1024),
        ],
        'profile_creation' => [
            'temperature' => env('AI_PROFILE_CREATION_TEMPERATURE', 0.3),
            'max_tokens' => env('AI_PROFILE_CREATION_MAX_TOKENS', 2048),
        ],
        'question_answering' => [
            'temperature' => env('AI_QUESTION_ANSWERING_TEMPERATURE', 0.7),
            'max_tokens' => env('AI_QUESTION_ANSWERING_MAX_TOKENS', 8192),
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
    ],
];
