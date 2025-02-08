<?php

// tests/Integration/ProfileCreationServiceTest.php

namespace Tests\Integration;

use App\Services\ProfileCreationService;
use Tests\TestCase;

class ProfileCreationServiceTest extends TestCase
{
    public function test_create_profile_integration(): void
    {
        // Skip this test if the Gemini API key is not set.
        if (empty(env('GEMINI_API_KEY'))) {
            $this->markTestSkipped('Gemini API key is not set. Skipping ProfileCreationService integration test.');
        }

        // Use the actual Copytree project folder as the project path.
        // The base_path() helper returns the project root.
        $projectPath = base_path('app/');

        // Create an instance of ProfileCreationService.
        $service = new ProfileCreationService($projectPath);

        // Define the goals for the profile.
        $goals = [
            'Filter for only files that make Gemini AI API calls.',
        ];

        // Call createProfile to generate the profile data.
        $profileData = $service->createProfile($goals);

        // Assert that the profile data is a non-empty array/object.
        $this->assertNotEmpty($profileData, 'The generated profile data should not be empty.');

        // Assert that required keys exist.
        $this->assertArrayHasKey('rules', $profileData, 'Profile data must contain a "rules" key.');
        $this->assertArrayHasKey('globalExcludeRules', $profileData, 'Profile data must contain a "globalExcludeRules" key.');
        $this->assertArrayHasKey('always', $profileData, 'Profile data must contain an "always" key.');

        // Optionally, check that "rules" and "globalExcludeRules" are arrays.
        $this->assertIsArray($profileData['rules'], 'The "rules" key should be an array.');
        $this->assertIsArray($profileData['globalExcludeRules'], 'The "globalExcludeRules" key should be an array.');

        // Output the generated profile data to STDOUT for manual inspection.
        fwrite(STDOUT, "Generated Profile Data:\n".json_encode($profileData, JSON_PRETTY_PRINT)."\n");
    }
}
