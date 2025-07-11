<?php

namespace Tests\Integration;

use App\Services\ProjectQuestionService;
use Tests\TestCase;

class GeminiStreamingBehaviorTest extends TestCase
{
    protected ProjectQuestionService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new ProjectQuestionService();
    }

    /**
     * Test and document Gemini's behavior regarding usage data in streaming vs non-streaming modes
     * 
     * FINDINGS:
     * - Non-streaming: Usage data IS available in the response
     * - Streaming: Usage data is NOT available in any chunk, including the final chunk
     * 
     * This test documents the current behavior so we know what to expect.
     */
    public function test_gemini_usage_data_availability()
    {
        $projectContent = "This is a test project.";
        $question = "What is 2+2?";
        $history = [];
        $modelName = config('ai.providers.gemini.models.medium', 'gemini-2.5-flash-preview-05-20');
        
        // Test 1: Non-streaming mode
        echo "\n=== TEST 1: Non-streaming Mode ===\n";
        try {
            $response = $this->service->askQuestion(
                $projectContent,
                $question,
                $history,
                'gemini',
                $modelName
            );
            
            // Check if usage is available
            $hasUsage = property_exists($response, 'usage') && $response->usage !== null;
            echo "Non-streaming has usage data: " . ($hasUsage ? "YES" : "NO") . "\n";
            
            if ($hasUsage) {
                echo "Usage data:\n";
                echo "  - promptTokens: " . ($response->usage->promptTokens ?? 'N/A') . "\n";
                echo "  - completionTokens: " . ($response->usage->completionTokens ?? 'N/A') . "\n";
                echo "  - thoughtTokens: " . ($response->usage->thoughtTokens ?? 'N/A') . "\n";
            }
            
            $this->assertTrue($hasUsage, 'Non-streaming mode should have usage data');
            
        } catch (\Exception $e) {
            $this->fail("Non-streaming test failed: " . $e->getMessage());
        }
        
        // Test 2: Streaming mode
        echo "\n=== TEST 2: Streaming Mode ===\n";
        try {
            $stream = $this->service->askQuestionStream(
                $projectContent,
                $question,
                $history,
                'gemini',
                $modelName
            );
            
            $foundUsageInAnyChunk = false;
            $chunkCount = 0;
            $lastChunk = null;
            
            foreach ($stream as $chunk) {
                $chunkCount++;
                $lastChunk = $chunk;
                
                // Check for usage in additionalContent
                if (isset($chunk->additionalContent['usage'])) {
                    $foundUsageInAnyChunk = true;
                    echo "Found usage in chunk $chunkCount\n";
                }
                
                // Check for usage property directly
                if (property_exists($chunk, 'usage') && $chunk->usage !== null) {
                    $foundUsageInAnyChunk = true;
                    echo "Found usage property in chunk $chunkCount\n";
                }
            }
            
            echo "Total chunks: $chunkCount\n";
            echo "Found usage in any chunk: " . ($foundUsageInAnyChunk ? "YES" : "NO") . "\n";
            
            // Special check for last chunk
            if ($lastChunk) {
                echo "\nLast chunk analysis:\n";
                echo "  - Has additionalContent: " . (isset($lastChunk->additionalContent) ? "yes" : "no") . "\n";
                echo "  - additionalContent has usage: " . (isset($lastChunk->additionalContent['usage']) ? "yes" : "no") . "\n";
                echo "  - Has usage property: " . (property_exists($lastChunk, 'usage') ? "yes" : "no") . "\n";
            }
            
            $this->assertGreaterThan(0, $chunkCount, 'Should have received streaming chunks');
            $this->assertFalse($foundUsageInAnyChunk, 'Gemini streaming does not provide usage data');
            
        } catch (\Exception $e) {
            $this->fail("Streaming test failed: " . $e->getMessage());
        }
        
        // Summary
        echo "\n=== SUMMARY ===\n";
        echo "Gemini provides usage data in non-streaming mode: YES\n";
        echo "Gemini provides usage data in streaming mode: NO\n";
        echo "\nImplication: When using Gemini with streaming (which is the default for the ask command),\n";
        echo "token usage information will not be available. This is a limitation of Gemini's API.\n";
    }
}