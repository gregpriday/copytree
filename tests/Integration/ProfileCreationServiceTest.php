<?php

namespace Tests\Integration;

use App\Services\ProfileCreationService;
use Tests\TestCase;

class ProfileCreationServiceTest extends TestCase
{
    public function test_create_profile_integration(): void
    {
        // Skip this test if the Fireworks API key is not set.
        if (empty(env('FIREWORKS_API_KEY'))) {
            $this->markTestSkipped('Fireworks API key is not set. Skipping ProfileCreationService integration test.');
        }

        // Use the actual Copytree project folder as the project path.
        // The base_path() helper returns the project root.
        $projectPath = base_path('app/');

        // Create an instance of ProfileCreationService.
        $service = new ProfileCreationService($projectPath);

        // Define the goals for the profile.
        $goals = [
            'Give me only files that are involved in creating the filtering pipeline.',
        ];

        // Call createProfile to generate the profile data.
        $profileData = $service->createProfile($goals);

        // Assert that the profile data is a non-empty array.
        $this->assertNotEmpty($profileData, 'The generated profile data should not be empty.');
        $this->assertIsArray($profileData, 'The generated profile data should be an array.');

        // Assert that required keys exist in the new YAML format.
        $this->assertArrayHasKey('include', $profileData, 'Profile data must contain an "include" key.');
        $this->assertArrayHasKey('exclude', $profileData, 'Profile data must contain an "exclude" key.');

        // Optionally, check that "include", "exclude", and "always" are arrays.
        $this->assertIsArray($profileData['include'], 'The "include" key should be an array.');
        $this->assertIsArray($profileData['exclude'], 'The "exclude" key should be an array.');

        // Output the generated profile data to STDOUT for manual inspection.
        fwrite(STDOUT, "Generated Profile Data (YAML parsed as JSON):\n".json_encode($profileData, JSON_PRETTY_PRINT)."\n");
    }
}
