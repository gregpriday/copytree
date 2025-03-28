<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Conversation State Management
    |--------------------------------------------------------------------------
    |
    | Here you may configure the conversation state management used by the 
    | copytree ask command to maintain conversation history between commands.
    |
    */

    /*
    |--------------------------------------------------------------------------
    | History Limit
    |--------------------------------------------------------------------------
    |
    | The maximum number of conversation exchanges to keep in history.
    | Each exchange consists of a user message and a model response.
    | This setting helps prevent excessive token usage in the context.
    |
    */
    'history_limit' => env('COPYTREE_HISTORY_LIMIT', 10),

    /*
    |--------------------------------------------------------------------------
    | Summary Length
    |--------------------------------------------------------------------------
    |
    | The maximum length in characters for summarized model responses.
    | Model responses are summarized before being stored to save space
    | and reduce context length in future interactions.
    |
    */
    'summary_length' => env('COPYTREE_SUMMARY_LENGTH', 500),

    /*
    |--------------------------------------------------------------------------
    | Garbage Collection
    |--------------------------------------------------------------------------
    |
    | Settings related to the cleanup of old conversation history.
    |
    */
    'garbage_collection' => [
        // Default number of days after which history is considered stale
        'default_days' => env('COPYTREE_GC_DAYS', 7),
    ],
]; 