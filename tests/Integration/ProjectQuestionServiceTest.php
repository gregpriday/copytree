<?php

namespace Tests\Integration;

use App\Services\ProjectQuestionService;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\File;
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
    }

    public function test_ask_question_returns_valid_response()
    {
        // Generate a limited copytree of the project
        // We'll focus on just the Commands directory to keep it manageable
        Artisan::call('copy', [
            '--display' => true,
        ]);
        $copytree = Artisan::output();

        // Ensure we got some content
        $this->assertNotEmpty($copytree);
        $this->assertStringContainsString('<ct:project>', $copytree);
        $this->assertStringContainsString('CopyTreeCommand.php', $copytree);

        // Create service instance
        $service = new ProjectQuestionService;

        // Ask a simple question about the commands
        $question = 'I want to enhance the use of AI in this project, where are some places I could look that could be enhanced with AI?';
        $response = $service->askQuestion($copytree, $question);

        // Check that we got a valid response
        $this->assertNotEmpty($response);

        // Verify the response contains expected elements based on our system prompt
        $this->assertMatchesRegularExpression('/app\/Commands\/[A-Za-z]+\.php \[.*\]/', $response,
            'Response should include file paths with explanations in square brackets');

        // Verify the response includes code snippets or function references
        $this->assertStringContainsString('function', $response);

        // Output the response for manual inspection
        fwrite(STDOUT, "\nResponse from Gemini:\n".substr($response, 0, 500)."...\n");
    }
}
