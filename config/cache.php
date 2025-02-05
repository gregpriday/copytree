<?php

use Illuminate\Support\Str;

return [

    /*
    |--------------------------------------------------------------------------
    | Default Cache Store
    |--------------------------------------------------------------------------
    |
    | This option controls the default cache store that will be used by the
    | framework. In this configuration, we are exclusively using the file
    | cache driver.
    |
    */

    'default' => 'file',

    /*
    |--------------------------------------------------------------------------
    | Cache Stores
    |--------------------------------------------------------------------------
    |
    | Here we define the file cache store. Cached items will be stored in the
    | ~/.copytree/cache directory. The `lock_path` is set to the same location.
    |
    */

    'stores' => [
        'file' => [
            'driver'    => 'file',
            'path'      => getenv('HOME') . '/.copytree/cache',
            'lock_path' => getenv('HOME') . '/.copytree/cache',
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Cache Key Prefix
    |--------------------------------------------------------------------------
    |
    | When using a shared cache, the prefix helps to avoid collisions with other
    | applications. You can modify this value as needed.
    |
    */

    'prefix' => Str::slug(env('APP_NAME', 'laravel'), '_') . '_cache_',

];
