<?php

namespace App\Helpers;

use Prism\Prism\Prism;

/**
 * Adapter to use Fireworks AI through Prism's OpenAI provider
 */
class FireworksPrismAdapter
{
    private $pendingRequest;

    private $originalConfig;

    public function __construct(string $model)
    {
        // Store original OpenAI config
        $this->originalConfig = config('prism.providers.openai');

        // Get Fireworks config
        $fireworksConfig = config('prism.providers.fireworks');

        // Add missing fields that OpenAI provider expects
        $fireworksConfig['organization'] = null;
        $fireworksConfig['project'] = null;

        // Override with Fireworks config
        config([
            'prism.providers.openai' => $fireworksConfig,
        ]);

        // Create Prism instance with Fireworks config
        $this->pendingRequest = Prism::text()->using('openai', $model);
    }

    public function __destruct()
    {
        // Restore original config when object is destroyed
        config(['prism.providers.openai' => $this->originalConfig]);
    }

    public function __call($method, $args)
    {
        try {
            $result = call_user_func_array([$this->pendingRequest, $method], $args);

            // If this is a terminal method that returns a response, restore config
            if (in_array($method, ['asText', 'asStructured', 'asJson', 'asStream', 'stream'])) {
                config(['prism.providers.openai' => $this->originalConfig]);
            }

            return $result;
        } catch (\Exception $e) {
            // Restore config on error too
            config(['prism.providers.openai' => $this->originalConfig]);
            throw $e;
        }
    }
}
