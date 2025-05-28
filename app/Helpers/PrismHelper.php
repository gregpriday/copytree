<?php

namespace App\Helpers;

use Prism\Prism\Prism;

class PrismHelper
{
    /**
     * Create a Prism text instance with the appropriate provider configuration.
     *
     * For Fireworks, we use the OpenAI provider since Fireworks has an OpenAI-compatible API
     * but Prism doesn't have a native Fireworks provider.
     *
     * @return \Prism\Prism\Text\PendingRequest
     */
    public static function text(string $provider, string $model)
    {
        // For Fireworks, use our custom adapter
        if ($provider === 'fireworks') {
            return new FireworksPrismAdapter($model);
        }

        return Prism::text()->using($provider, $model);
    }
}
