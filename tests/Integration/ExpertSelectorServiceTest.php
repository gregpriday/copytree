<?php

namespace Tests\Integration;

use App\Services\ExpertSelectorService;
use Tests\TestCase;

class ExpertSelectorServiceTest extends TestCase
{
    public function test_select_expert_returns_appropriate_expert_for_questions()
    {
        // Skip if no API key is configured
        if (empty(config('ai.providers.fireworks.key'))) {
            $this->markTestSkipped('Fireworks API key not set. Skipping integration test.');
        }

        // Create service instance
        $service = new ExpertSelectorService;

        // Test cases for different types of questions
        $testCases = [
            [
                'question' => 'How do fix the error undefined index in the function define_function?',
                'expected_expert_type' => 'default',
            ],
            [
                'question' => 'I need to design a new button, what is the overall design of this site?',
                'expected_expert_type' => 'designer',
            ],
        ];

        foreach ($testCases as $testCase) {
            // Select an expert for this question using the real AI service
            $selectedExpert = $service->selectExpert($testCase['question']);

            // Output for debugging
            fwrite(STDOUT, "Question: {$testCase['question']}\n");
            fwrite(STDOUT, "Selected expert: {$selectedExpert}\n\n");

            $this->assertEquals($testCase['expected_expert_type'], $selectedExpert);
        }
    }
}
