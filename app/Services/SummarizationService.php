<?php

namespace App\Services;

use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Prism\Prism\Prism;
use Prism\Prism\ValueObjects\Messages\UserMessage;

class SummarizationService
{
    /**
     * Default maximum length for summaries in characters.
     */
    protected int $defaultMaxLength = 1000;

    /**
     * Default provider and model for summarization.
     */
    protected string $defaultProvider;

    protected string $defaultModel;

    /**
     * Create a new SummarizationService instance.
     */
    public function __construct()
    {
        // Get defaults from config
        $this->defaultProvider = Config::get('ai.default_provider', 'openai');
        $modelSize = Config::get('ai.defaults.model_size_for_summarization', 'small');
        $this->defaultModel = Config::get("ai.providers.{$this->defaultProvider}.models.{$modelSize}", 'gpt-4o-mini');
    }

    /**
     * Summarize a text to a specified maximum length using AI.
     *
     * @param  string  $text  The text to summarize
     * @param  int|null  $maxLength  Maximum summary length (defaults to $defaultMaxLength)
     * @param  string|null  $provider  Optional AI provider (defaults to configured provider)
     * @param  string|null  $model  Optional AI model (defaults to configured model)
     * @return string The summarized text, or the original if it's already shorter than the max length
     */
    public function summarizeText(string $text, ?int $maxLength = null, ?string $provider = null, ?string $model = null): string
    {
        $maxChars = $maxLength ?? $this->defaultMaxLength;

        // No need to summarize if already shorter than the max length
        if (Str::length($text) <= $maxChars) {
            return $text;
        }

        $provider = $provider ?? $this->defaultProvider;
        $model = $model ?? $this->defaultModel;

        try {
            // Simple summarization prompt
            $prompt = "Summarize the following text concisely, capturing the main points, in under {$maxChars} characters:\n\n{$text}";

            // Get task-specific parameters from config
            $maxTokensForSummarization = config('ai.task_parameters.summarization.max_tokens', 512);
            $temperatureForSummarization = config('ai.task_parameters.summarization.temperature', 0.2);

            // Use Prism for summarization
            $response = Prism::text()
                ->using($provider, $model)
                ->withMessages([new UserMessage($prompt)])
                ->withMaxTokens($maxTokensForSummarization)
                ->usingTemperature($temperatureForSummarization)
                ->asText();

            $summary = trim($response->text);

            // Fallback if summary is empty or longer than requested
            if (empty($summary)) {
                return Str::limit($text, $maxChars, '...');
            }

            // Ensure the summary doesn't exceed the maximum length
            return Str::length($summary) <= $maxChars
                ? $summary
                : Str::limit($summary, $maxChars, '...');
        } catch (\Prism\Prism\Exceptions\PrismException $e) {
            Log::warning("Prism failed to summarize text for Provider [{$provider}], Model [{$model}]: {$e->getMessage()}");

            return Str::limit($text, $maxChars, '...');
        } catch (\Throwable $e) {
            Log::warning("Generic error summarizing text: {$e->getMessage()}");

            return Str::limit($text, $maxChars, '...');
        }
    }

    /**
     * Set the default maximum length for summaries.
     */
    public function setDefaultMaxLength(int $length): self
    {
        $this->defaultMaxLength = $length;

        return $this;
    }

    /**
     * Get the current default maximum length for summaries.
     */
    public function getDefaultMaxLength(): int
    {
        return $this->defaultMaxLength;
    }
}
