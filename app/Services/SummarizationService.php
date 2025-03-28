<?php

namespace App\Services;

use Gemini\Laravel\Facades\Gemini;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class SummarizationService
{
    /**
     * Default maximum length for summaries in characters.
     */
    protected int $defaultMaxLength = 1000;

    /**
     * The Gemini model to use for summarization.
     * Preferably a fast, efficient model like Flash.
     */
    protected string $model;

    /**
     * Create a new SummarizationService instance.
     */
    public function __construct()
    {
        // Use the Gemini Flash model defined in config, or fallback to the default model
        $this->model = config('gemini.model_flash', config('gemini.model'));
    }

    /**
     * Summarize a text to a specified maximum length using Gemini.
     *
     * @param  string  $text  The text to summarize
     * @param  int|null  $maxLength  Maximum summary length (defaults to $defaultMaxLength)
     * @return string The summarized text, or the original if it's already shorter than the max length
     */
    public function summarizeText(string $text, ?int $maxLength = null): string
    {
        $maxChars = $maxLength ?? $this->defaultMaxLength;

        // No need to summarize if already shorter than the max length
        if (Str::length($text) <= $maxChars) {
            return $text;
        }

        try {
            // Simple summarization prompt
            $prompt = "Summarize the following text concisely, capturing the main points, in under {$maxChars} characters:\n\n{$text}";

            // Use Gemini Flash model for fast, efficient summarization
            $response = Gemini::generativeModel(model: $this->model)
                ->generateContent($prompt);

            $summary = trim($response->text());

            // Fallback if summary is empty or longer than requested
            if (empty($summary)) {
                return Str::limit($text, $maxChars, '...');
            }

            // Ensure the summary doesn't exceed the maximum length
            return Str::length($summary) <= $maxChars
                ? $summary
                : Str::limit($summary, $maxChars, '...');
        } catch (\Exception $e) {
            // Log the error and return a truncated version of the original
            Log::warning('Failed to summarize text: '.$e->getMessage());

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
