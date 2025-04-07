<?php

return [
    'key' => env('FIREWORKS_API_KEY'),
    // Default model
    'model' => env('FIREWORKS_MODEL', 'accounts/fireworks/models/llama4-maverick-instruct-basic'),
    // Specific model for the ask command
    'ask_model' => env('FIREWORKS_ASK_MODEL', 'accounts/fireworks/models/llama4-maverick-instruct-basic'),
    // Specific model for expert selection
    'expert_selector_model' => env('FIREWORKS_EXPERT_SELECTOR_MODEL', 'accounts/fireworks/models/llama4-maverick-instruct-basic'),
    // Specific model for summarization
    'summarization_model' => env('FIREWORKS_SUMMARIZATION_MODEL', 'accounts/fireworks/models/llama4-maverick-instruct-basic'),
    // Specific model for classification
    'classification_model' => env('FIREWORKS_CLASSIFICATION_MODEL', 'accounts/fireworks/models/llama4-maverick-instruct-basic'),
    // General purpose model
    'general_model' => env('FIREWORKS_GENERAL_MODEL', 'accounts/fireworks/models/llama4-maverick-instruct-basic'),
];
