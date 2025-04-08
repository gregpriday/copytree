<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;
use InvalidArgumentException;

class ConfigValidator
{
    /**
     * Validate AI configuration
     *
     * @param array $config The AI configuration array
     * @return bool True if validation passes
     * @throws InvalidArgumentException If validation fails
     */
    public function validateAiConfig(array $config): bool
    {
        // Validate provider key
        $provider = $config['default_provider'] ?? null;
        if (!$provider) {
            throw new InvalidArgumentException('Default AI provider must be specified');
        }
        
        // Check if the provider exists in the providers array
        if (!isset($config['providers'][$provider])) {
            throw new InvalidArgumentException("Provider '{$provider}' is not defined in the providers configuration");
        }
        
        // Validate provider configuration
        $providerConfig = $config['providers'][$provider];
        
        if (empty($providerConfig['key'])) {
            Log::warning("AI provider '{$provider}' is missing an API key. Some AI features may not work.");
        }
        
        // Validate models
        // Check if the models key exists and is not empty for the default provider
        $models = $providerConfig['models'] ?? null; 
        if (empty($models)) {
            throw new InvalidArgumentException("Default AI provider '{$provider}' has no models configured");
        }
        
        // Check parameters
        if (isset($config['parameters']['temperature']) &&
            ($config['parameters']['temperature'] < 0 || $config['parameters']['temperature'] > 1)
        ) {
            throw new InvalidArgumentException('Temperature must be between a value between 0 and 1');
        }
        
        return true;
    }
    
    /**
     * Validate logging configuration
     *
     * @param array $config The logging configuration array
     * @return bool True if validation passes
     * @throws InvalidArgumentException If validation fails
     */
    public function validateLoggingConfig(array $config): bool
    {
        // Validate default channel
        $defaultChannel = $config['default'] ?? null;
        if (!$defaultChannel) {
            throw new InvalidArgumentException('Default logging channel must be specified');
        }
        
        // Check if the channel exists
        if (!isset($config['channels'][$defaultChannel])) {
            throw new InvalidArgumentException("Logging channel '{$defaultChannel}' is not defined in the channels configuration");
        }
        
        // Validate daily log retention
        foreach ($config['channels'] as $channelName => $channelConfig) {
            // Skip validation if driver is not set or config is not an array
            if (!is_array($channelConfig) || !isset($channelConfig['driver'])) {
                continue;
            }
            
            if ($channelConfig['driver'] === 'daily' && isset($channelConfig['days'])) {
                if (!is_numeric($channelConfig['days']) || $channelConfig['days'] < 1) {
                    throw new InvalidArgumentException("Log retention days for channel '{$channelName}' must be a positive number");
                }
            }
        }
        
        return true;
    }
    
    /**
     * Validate state configuration
     *
     * @param array $config The state configuration array
     * @return bool True if validation passes
     * @throws InvalidArgumentException If validation fails
     */
    public function validateStateConfig(array $config): bool
    {
        // Check if config is empty or not an array
        if (empty($config) || !is_array($config)) {
            Log::warning('State configuration is empty or not an array.');
            return true; // Return true but log a warning
        }
        
        // Validate garbage collection
        if (isset($config['garbage_collection']['default_days'])) {
            $days = $config['garbage_collection']['default_days'];
            if (!is_numeric($days) || $days < 0) {
                throw new InvalidArgumentException('Garbage collection days must be a non-negative number');
            }
        }
        
        return true;
    }
    
    /**
     * Validate the entire application configuration
     *
     * @return bool True if validation passes
     * @throws InvalidArgumentException If validation fails
     */
    public function validateApplicationConfig(): bool
    {
        try {
            // Validate AI Configuration
            if (config()->has('ai')) {
                $this->validateAiConfig(config('ai'));
            } else {
                Log::warning('AI configuration not found. AI features may not work properly.');
            }
            
            // Validate Logging Configuration
            if (config()->has('logging')) {
                $this->validateLoggingConfig(config('logging'));
            } else {
                Log::warning('Logging configuration not found. Using default logging settings.');
            }
            
            // Validate State Configuration
            if (config()->has('state')) {
                $this->validateStateConfig(config('state'));
            } else {
                Log::warning('State configuration not found. Conversation state features may not work properly.');
            }
            
            return true;
        } catch (InvalidArgumentException $e) {
            Log::error('Configuration validation failed: ' . $e->getMessage());
            throw $e;
        }
    }
} 