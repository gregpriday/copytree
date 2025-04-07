<?php

namespace App\Facades;

use Illuminate\Support\Facades\Facade;

/**
 * @method static \OpenAI\Resources\Chat chat()
 */
class Fireworks extends Facade
{
    protected static function getFacadeAccessor(): string
    {
        return 'fireworks';
    }
}
