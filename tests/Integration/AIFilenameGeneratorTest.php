<?php

namespace Tests\Integration;

use App\Services\AIFilenameGenerator;
use Tests\TestCase;

class AIFilenameGeneratorTest extends TestCase
{
    public function test_generate_filename_integration()
    {
        // Skip the test if the OpenAI API key is not provided.
        if (empty(env('OPENAI_API_KEY'))) {
            $this->markTestSkipped('OpenAI API key not set in .env file.');
        }

        $generator = new AIFilenameGenerator;

        // Create a sample files array.
        $files = [
            ['path' => 'src/Controller/UserController.php'],
            ['path' => 'src/Model/User.php'],
            ['path' => 'README.md'],
        ];

        // Generate the filename using the AI service.
        $filename = $generator->generateFilename($files);

        // Assert that a filename is generated.
        $this->assertNotEmpty($filename, 'Generated filename should not be empty.');

        // Assert that the filename ends with ".txt".
        $this->assertStringEndsWith('.txt', $filename, 'Generated filename should end with .txt.');

        // Assert that the filename is in hyphen‑case (only lowercase letters, numbers, and hyphens) before the extension.
        $this->assertMatchesRegularExpression('/^[a-z0-9-]+\.txt$/', $filename, 'Filename should only contain lowercase letters, numbers, and hyphens, ending with .txt');

        // Optionally, check that the base filename (without ".txt") does not exceed 90 characters.
        $baseFilename = substr($filename, 0, -4);
        $this->assertLessThanOrEqual(90, strlen($baseFilename), 'Filename (without extension) should be at most 90 characters.');
    }
}
