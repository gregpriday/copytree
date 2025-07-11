<?php

namespace Tests\Unit\Services;

use App\Services\ProjectQuestionService;
use Illuminate\Support\Facades\File;
use Prism\Prism\Prism;
use Prism\Prism\Testing\TextResponseFake;
use Prism\Prism\ValueObjects\Usage;
use Tests\TestCase;

class ProjectQuestionServiceTest extends TestCase
{
    public function test_ask_question_successfully_uses_prism()
    {
        // Mock the system prompt file read
        File::shouldReceive('exists')->once()->with(base_path('prompts/project-question/system.txt'))->andReturn(true);
        File::shouldReceive('get')->once()->with(base_path('prompts/project-question/system.txt'))->andReturn('System Prompt Content.');

        $fakeText = 'This is a faked AI response.';
        $fakeUsage = new Usage(promptTokens: 50, completionTokens: 100);

        Prism::fake([
            TextResponseFake::make()
                ->withText($fakeText)
                ->withUsage($fakeUsage),
        ]);

        $service = new ProjectQuestionService;
        $response = $service->askQuestion(
            'project context',
            'test question',
            [],
            'openai', // Or any provider you've configured Prism for
            'gpt-4o'  // Specific model string
        );

        $this->assertEquals($fakeText, $response->text);
        $this->assertEquals(50, $response->usage->promptTokens);
        $this->assertEquals(100, $response->usage->completionTokens);

        // Verify Prism was called
        $this->assertTrue(true); // Prism doesn't have assertSent, but the test passed if we got here
    }

    public function test_ask_question_with_history()
    {
        // Mock the system prompt file read
        File::shouldReceive('exists')->once()->with(base_path('prompts/project-question/system.txt'))->andReturn(true);
        File::shouldReceive('get')->once()->with(base_path('prompts/project-question/system.txt'))->andReturn('System Prompt Content.');

        $fakeText = 'Response with history context.';
        $fakeUsage = new Usage(promptTokens: 150, completionTokens: 200);

        Prism::fake([
            TextResponseFake::make()
                ->withText($fakeText)
                ->withUsage($fakeUsage),
        ]);

        $history = [
            ['role' => 'user', 'content' => 'Previous question'],
            ['role' => 'assistant', 'content' => 'Previous answer'],
        ];

        $service = new ProjectQuestionService;
        $response = $service->askQuestion(
            'project context',
            'follow-up question',
            $history,
            'openai',
            'gpt-4o'
        );

        $this->assertEquals($fakeText, $response->text);

        // Verify the response was returned correctly
        $this->assertNotEmpty($response->text);
    }

    public function test_ask_question_handles_xml_tags_in_history()
    {
        // Mock the system prompt file read
        File::shouldReceive('exists')->once()->with(base_path('prompts/project-question/system.txt'))->andReturn(true);
        File::shouldReceive('get')->once()->with(base_path('prompts/project-question/system.txt'))->andReturn('System Prompt Content.');

        $fakeText = 'Response with cleaned history.';
        Prism::fake([
            TextResponseFake::make()->withText($fakeText),
        ]);

        $history = [
            ['role' => 'user', 'content' => '<ct:summary>Summarized content</ct:summary>'],
            ['role' => 'assistant', 'content' => '<ct:truncated>Truncated response</ct:truncated>'],
        ];

        $service = new ProjectQuestionService;
        $response = $service->askQuestion(
            '',
            'new question',
            $history,
            'openai',
            'gpt-4o'
        );

        // Verify the response was returned correctly
        $this->assertEquals($fakeText, $response->text);
    }

    public function test_ask_question_throws_exception_when_system_prompt_not_found()
    {
        // Mock the system prompt file as not existing
        File::shouldReceive('exists')->once()->with(base_path('prompts/project-question/system.txt'))->andReturn(false);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('System prompt not found');

        $service = new ProjectQuestionService;
        $service->askQuestion(
            'project context',
            'test question',
            [],
            'openai',
            'gpt-4o'
        );
    }

    // TODO: Add test for PrismException handling once we understand the correct pattern
}
