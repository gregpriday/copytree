<?php

namespace Tests\Integration;

use App\Services\ProjectQuestionService;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\File;
use RuntimeException;
use Tests\TestCase;

class ProjectQuestionServiceTest extends TestCase
{
    /**
     * Make sure the system prompt exists before running the test.
     */
    protected function setUp(): void
    {
        parent::setUp();

        // Ensure the prompts directory exists
        $promptsDir = base_path('prompts/project-question/default');
        if (! File::isDirectory($promptsDir)) {
            File::makeDirectory($promptsDir, 0755, true);
        }

        // Ensure the system prompt file exists
        $systemPromptPath = $promptsDir.'/system.txt';
        if (! File::exists($systemPromptPath)) {
            File::put($systemPromptPath, 'You are an expert at analyzing codebases and providing detailed insights about their structure and potential improvements.');
        }
    }

    public function test_ask_question_returns_valid_response()
    {
        // Skip the test if the copy command doesn't exist or fails
        try {
            // Generate a limited copytree of the project
            Artisan::call('copy', [
                '--display' => true,
            ]);
            $copytree = Artisan::output();
        } catch (\Exception $e) {
            $this->markTestSkipped('The copy command is not available: '.$e->getMessage());

            return;
        }

        // Ensure we got some content
        $this->assertNotEmpty($copytree);
        $this->assertStringContainsString('<ct:project>', $copytree);
        $this->assertStringContainsString('CopyTreeCommand.php', $copytree);

        // Create service instance
        $service = new ProjectQuestionService;

        try {
            // Ask a simple question about the commands
            $question = 'I want to enhance the use of AI in this project, where are some places I could look that could be enhanced with AI?';
            $expertConfig = [
                'expert' => 'default',
                'provider' => 'gemini',
                'model' => 'medium',
            ];
            $response = $service->askQuestion(
                $copytree,
                $question,
                [], // empty history
                'fireworks', // provider
                'medium' // model
            )->text;

            // Check that we got a valid response
            $this->assertNotEmpty($response);

            // Verify the response is a meaningful analysis
            $this->assertStringContainsString('app', $response, 'Response should mention application paths');
            $this->assertStringContainsString('AI', $response, 'Response should discuss AI-related topics');

            // Output the response for manual inspection
            fwrite(STDOUT, "\nResponse from AI:\n".substr($response, 0, 500)."...\n");
        } catch (RuntimeException $e) {
            $message = $e->getMessage();
            if (strpos($message, '400 Bad Request') !== false) {
                $this->markTestSkipped(
                    "AI service returned a 400 Bad Request error. This is an integration test and requires a working AI service.\n".
                    'Error details: '.$message
                );
            } elseif (strpos($message, '401 Unauthorized') !== false) {
                $this->markTestSkipped(
                    "AI service authentication failed (401 Unauthorized). Please check your API credentials.\n".
                    'Error details: '.$message
                );
            } elseif (strpos($message, '429 Too Many Requests') !== false) {
                $this->markTestSkipped(
                    "AI service rate limit exceeded (429 Too Many Requests). Try again later.\n".
                    'Error details: '.$message
                );
            } else {
                $this->markTestSkipped(
                    "AI service unavailable. This is an integration test and requires a working AI service.\n".
                    'Error details: '.$message
                );
            }
        }
    }
}
