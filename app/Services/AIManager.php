<?php

namespace App\Services;

use Illuminate\Contracts\Container\Container; // Import Container for constructor type hint
use Illuminate\Support\Manager;
use Illuminate\Support\Traits\Macroable; // Import the Macroable trait
use OpenAI;
use OpenAI\Client as OpenAIClient; // Alias OpenAI's Client for clarity
use GuzzleHttp\Client as HttpClient;
use GuzzleHttp\HandlerStack;
// use GuzzleHttp\Middleware; // Likely unused directly here
// use Psr\Http\Message\ResponseInterface; // Likely unused directly here
use InvalidArgumentException; // Use specific exception type

class AIManager extends Manager
{
    // Use the Macroable trait to allow adding methods at runtime
    use Macroable;

    /**
     * Create a new manager instance.
     * We override the constructor just to ensure type hinting if needed,
     * but parent::__construct does the heavy lifting.
     *
     * @param \Illuminate\Contracts\Container\Container $container
     * @return void
     */
    public function __construct(Container $container)
    {
        parent::__construct($container);
    }

    /**
     * Get the default driver name.
     *
     * @return string
     * @throws \InvalidArgumentException If the default provider is not configured.
     */
    public function getDefaultDriver(): string
    {
        // $this->config is available from the parent Manager class (accessing $app['config'])
        $default = $this->config->get('ai.default_provider'); // Removed default 'fireworks' here to rely solely on config

        if (is_null($default)) {
            throw new InvalidArgumentException('Default AI provider name (ai.default_provider) is not configured.');
        }

        return $default;
    }

    /**
     * Create an instance of the specified driver.
     *
     * @param string $driver The name of the driver.
     * @return \OpenAI\Client The OpenAI Client instance for the driver.
     * @throws \InvalidArgumentException If the driver configuration is missing or invalid.
     */
    protected function createDriver($driver): OpenAIClient // Add return type hint
    {
        // Configuration is fetched using the resolved driver name
        $config = $this->config->get("ai.providers.{$driver}");

        if (empty($config)) {
            throw new InvalidArgumentException("AI provider configuration for [{$driver}] is not defined.");
        }

        // Validate essential configuration keys
        if (empty($config['key']) || empty($config['base_url'])) {
            throw new InvalidArgumentException("AI provider configuration for [{$driver}] must include 'key' and 'base_url'.");
        }

        // Guzzle HTTP Client Setup
        $stack = HandlerStack::create();
        // Add any Guzzle middleware to the $stack here if needed in the future
        // Example: $stack->push(Middleware::log(logger(), new MessageFormatter()));

        $httpClient = new HttpClient([
            'timeout' => $config['timeout'] ?? 30, // Use configured timeout or a default (e.g., 30 seconds)
            'connect_timeout' => $config['connect_timeout'] ?? 10, // Add connect timeout
            'handler' => $stack,
        ]);

        // Create and return the OpenAI client instance using the factory
        return OpenAI::factory()
            ->withApiKey($config['key'])
            ->withBaseUri($config['base_url'])
            ->withHttpClient($httpClient)
            ->make(); // Returns an instance of OpenAI\Client
    }

    public function models(string $driver = null): array
    {
        // If no driver is specified, return the default configuration
        if (is_null($driver)) {
            return $this->config->get('ai.providers.' . $this->getDefaultDriver().'.models');
        }

        // Otherwise, return the configuration for the specified driver
        return $this->config->get('ai.providers.' . $driver . '.models');
    }

    /**
     * Dynamically call methods on the default driver instance.
     *
     * This magic method intercepts calls to undefined methods on the AIManager instance
     * (like 'chat', 'embeddings', etc.) and forwards them to the client instance
     * returned by the default driver.
     *
     * @param string $method The method name being called.
     * @param array $parameters The arguments passed to the method.
     * @return mixed The result of the forwarded method call.
     */
    public function __call($method, $parameters)
    {
        // $this->driver() without arguments retrieves the *default* driver instance.
        // It internally calls getDefaultDriver() and createDriver() if needed,
        // and caches the instance for subsequent calls.
        $defaultDriverInstance = $this->driver();

        // Forward the call to the actual client instance (e.g., OpenAI\Client)
        // The spread operator (...) unpacks the $parameters array into arguments
        return $defaultDriverInstance->{$method}(...$parameters);
    }
}
