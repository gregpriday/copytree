<?php

namespace App\Facades;

use Illuminate\Support\Facades\Facade;

/**
 * @method static \OpenAI\Client driver(string $driver = null)
 * @method static \OpenAI\Client getDefaultDriver()
 * @method static array models(string $driver = null)
 * @method static \OpenAI\Resources\Assistants assistants()
 * @method static \OpenAI\Resources\Audio audio()
 * @method static \OpenAI\Resources\Batches batches()
 * @method static \OpenAI\Resources\Chat chat()
 * @method static \OpenAI\Resources\Completions completions()
 * @method static \OpenAI\Resources\Embeddings embeddings()
 * @method static \OpenAI\Resources\Edits edits()
 * @method static \OpenAI\Resources\Files files()
 * @method static \OpenAI\Resources\FineTunes fineTunes()
 * @method static \OpenAI\Resources\FineTuning fineTuning()
 * @method static \OpenAI\Resources\Images images()
 * @method static \OpenAI\Resources\Models models()
 * @method static \OpenAI\Resources\Moderations moderations()
 * @method static \OpenAI\Resources\Threads threads()
 * @method static \OpenAI\Resources\VectorStores vectorStores()
 */
class AI extends Facade
{
    /**
     * Get the registered name of the component.
     */
    protected static function getFacadeAccessor(): string
    {
        return 'ai';
    }
}
