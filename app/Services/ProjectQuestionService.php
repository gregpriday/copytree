<?php

namespace App\Services;

use App\Helpers\PrismHelper;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Prism\Prism\Text\Response as PrismTextResponse;
use Prism\Prism\ValueObjects\Messages\AssistantMessage;
use Prism\Prism\ValueObjects\Messages\UserMessage;
use RuntimeException;
use Throwable;

class ProjectQuestionService
{
    /**
     * The path to the directory containing the system prompt.
     */
    protected string $promptsBaseDir;

    /**
     * Create a new ProjectQuestionService instance.
     */
    public function __construct()
    {
        $this->promptsBaseDir = base_path('prompts/project-question');
    }

    /**
     * Ask a question about the project using Prism and return the full Prism response object.
     * Optionally includes conversation history for stateful interactions.
     *
     * @param  string  $projectCopytree  The copytree output of the project
     * @param  string  $question  The user's question about the project
     * @param  array  $history  Optional conversation history
     * @param  string  $providerName  The Prism-compatible provider name (e.g., 'openai', 'anthropic')
     * @param  string  $modelNameString  The specific model identifier (e.g., 'gpt-4o', 'claude-3-sonnet-20240229')
     * @return PrismTextResponse The response object from Prism
     *
     * @throws RuntimeException When the system prompt cannot be found or the API call fails
     */
    public function askQuestion(
        string $projectCopytree,
        string $question,
        array $history,
        string $providerName,
        string $modelNameString
    ): PrismTextResponse {
        // 1. Load System Prompt
        $systemPromptPath = $this->promptsBaseDir.'/system.txt';
        if (! File::exists($systemPromptPath)) {
            Log::error("System prompt not found at {$systemPromptPath}.");
            throw new RuntimeException("System prompt not found at {$systemPromptPath}.");
        }
        $systemPromptContent = File::get($systemPromptPath);

        // 2. Prepare Messages for Prism
        $prismMessages = [];

        // Add the project copytree output as the first user message
        // This sets the main context for the AI.
        if (! empty($projectCopytree)) {
            $prismMessages[] = new UserMessage($projectCopytree);
        }

        // Add conversation history
        // Convert your existing history format to Prism's Message objects
        if (! empty($history)) {
            foreach ($history as $histItem) {
                // Remove XML tags from stored summarized/truncated content
                $messageText = preg_replace('/<ct:(summary|truncated)>(.*?)<\/ct:\1>/s', '$2', $histItem['content']);
                if (! isset($histItem['role']) || ! isset($histItem['content'])) {
                    Log::warning('Malformed history item skipped.', ['item' => $histItem]);

                    continue;
                }
                if (strtolower($histItem['role']) === 'user') {
                    $prismMessages[] = new UserMessage($messageText);
                } elseif (strtolower($histItem['role']) === 'assistant') {
                    $prismMessages[] = new AssistantMessage($messageText);
                }
            }
        }

        // Add the current user question as the last message
        $prismMessages[] = new UserMessage($question);

        // 3. Make the AI Call using Prism
        try {
            Log::debug("Requesting AI response via Prism. Provider: [{$providerName}], Model: [{$modelNameString}]");

            $requestBuilder = PrismHelper::text($providerName, $modelNameString)
                ->withSystemPrompt($systemPromptContent);

            // Get task-specific parameters from config
            $temperature = config('ai.task_parameters.question_answering.temperature', 0.7);
            $maxTokens = config('ai.task_parameters.question_answering.max_tokens', 8192);

            $requestBuilder = $requestBuilder->withMaxTokens($maxTokens);
            $requestBuilder = $requestBuilder->usingTemperature($temperature);

            // Pass the messages to Prism
            if (! empty($prismMessages)) {
                $requestBuilder = $requestBuilder->withMessages($prismMessages);
            }

            // For Gemini 2.5 Flash models, set zero thinking budget
            if ($providerName === 'gemini' && Str::startsWith($modelNameString, 'gemini-2.5-flash')) {
                $requestBuilder = $requestBuilder->withProviderOptions(['thinkingBudget' => 0]);
                Log::debug("Using Gemini 2.5 Flash ({$modelNameString}) with zero thinking budget");
            }

            $response = $requestBuilder->asText();

            Log::debug('Prism AI call successful.');

            return $response;

        } catch (\Prism\Prism\Exceptions\PrismException $e) {
            Log::error("Prism API call failed for Provider [{$providerName}], Model [{$modelNameString}]: {$e->getMessage()}", [
                'exception_type' => get_class($e),
                'trace' => $e->getTraceAsString(),
            ]);
            throw new RuntimeException("Prism API call failed: {$e->getMessage()}", 0, $e);
        } catch (Throwable $e) {
            Log::error("Generic error during Prism AI call for Provider [{$providerName}], Model [{$modelNameString}]: {$e->getMessage()}", [
                'exception_type' => get_class($e),
                'trace' => $e->getTraceAsString(),
            ]);
            throw new RuntimeException("Error processing AI request: {$e->getMessage()}", 0, $e);
        }
    }

    /**
     * Ask a question about the project using Prism and return a streaming response.
     * Optionally includes conversation history for stateful interactions.
     *
     * @param  string  $projectCopytree  The copytree output of the project
     * @param  string  $question  The user's question about the project
     * @param  array  $history  Optional conversation history
     * @param  string  $providerName  The Prism-compatible provider name (e.g., 'openai', 'anthropic')
     * @param  string  $modelNameString  The specific model identifier (e.g., 'gpt-4o', 'claude-3-sonnet-20240229')
     * @return \Generator The streaming response from Prism
     *
     * @throws RuntimeException When the system prompt cannot be found or the API call fails
     */
    public function askQuestionStream(
        string $projectCopytree,
        string $question,
        array $history,
        string $providerName,
        string $modelNameString
    ): \Generator {
        // 1. Load System Prompt
        $systemPromptPath = $this->promptsBaseDir.'/system.txt';
        if (! File::exists($systemPromptPath)) {
            Log::error("System prompt not found at {$systemPromptPath}.");
            throw new RuntimeException("System prompt not found at {$systemPromptPath}.");
        }
        $systemPromptContent = File::get($systemPromptPath);

        // 2. Prepare Messages for Prism
        $prismMessages = [];

        // Add the project copytree output as the first user message
        // This sets the main context for the AI.
        if (! empty($projectCopytree)) {
            $prismMessages[] = new UserMessage($projectCopytree);
        }

        // Add conversation history
        // Convert your existing history format to Prism's Message objects
        if (! empty($history)) {
            foreach ($history as $histItem) {
                // Remove XML tags from stored summarized/truncated content
                $messageText = preg_replace('/<ct:(summary|truncated)>(.*?)<\/ct:\1>/s', '$2', $histItem['content']);
                if (! isset($histItem['role']) || ! isset($histItem['content'])) {
                    Log::warning('Malformed history item skipped.', ['item' => $histItem]);

                    continue;
                }
                if (strtolower($histItem['role']) === 'user') {
                    $prismMessages[] = new UserMessage($messageText);
                } elseif (strtolower($histItem['role']) === 'assistant') {
                    $prismMessages[] = new AssistantMessage($messageText);
                }
            }
        }

        // Add the current user question as the last message
        $prismMessages[] = new UserMessage($question);

        // 3. Make the AI Call using Prism streaming
        try {
            Log::debug("Requesting AI stream response via Prism. Provider: [{$providerName}], Model: [{$modelNameString}]");

            $requestBuilder = PrismHelper::text($providerName, $modelNameString)
                ->withSystemPrompt($systemPromptContent);

            // Get task-specific parameters from config
            $temperature = config('ai.task_parameters.question_answering.temperature', 0.7);
            $maxTokens = config('ai.task_parameters.question_answering.max_tokens', 8192);

            $requestBuilder = $requestBuilder->withMaxTokens($maxTokens);
            $requestBuilder = $requestBuilder->usingTemperature($temperature);

            // Pass the messages to Prism
            if (! empty($prismMessages)) {
                $requestBuilder = $requestBuilder->withMessages($prismMessages);
            }

            // For Gemini 2.5 Flash models, set zero thinking budget
            if ($providerName === 'gemini' && Str::startsWith($modelNameString, 'gemini-2.5-flash')) {
                $requestBuilder = $requestBuilder->withProviderOptions(['thinkingBudget' => 0]);
                Log::debug("Using Gemini 2.5 Flash ({$modelNameString}) with zero thinking budget");
            }

            // Return the stream generator
            return $requestBuilder->asStream();

        } catch (\Prism\Prism\Exceptions\PrismException $e) {
            Log::error("Prism API stream call failed for Provider [{$providerName}], Model [{$modelNameString}]: {$e->getMessage()}", [
                'exception_type' => get_class($e),
                'trace' => $e->getTraceAsString(),
            ]);
            throw new RuntimeException("Prism API stream call failed: {$e->getMessage()}", 0, $e);
        } catch (Throwable $e) {
            Log::error("Generic error during Prism AI stream call for Provider [{$providerName}], Model [{$modelNameString}]: {$e->getMessage()}", [
                'exception_type' => get_class($e),
                'trace' => $e->getTraceAsString(),
            ]);
            throw new RuntimeException("Error processing AI stream request: {$e->getMessage()}", 0, $e);
        }
    }
}
