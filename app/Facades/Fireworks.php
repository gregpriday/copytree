<?php

namespace App\Facades;

use Illuminate\Support\Facades\Facade;

/**
 * @method static \OpenAI\Resources\Chat chat()
 * 
 * @deprecated Use App\Facades\AI instead. This facade is kept for backward compatibility.
 */
class Fireworks extends Facade
{
    protected static function getFacadeAccessor(): string
    {
        return 'ai'; // Proxy to the AI facade
    }
}
