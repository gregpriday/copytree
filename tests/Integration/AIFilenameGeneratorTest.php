<?php

namespace Tests\Integration;

use App\Services\AIFilenameGenerator;
use Symfony\Component\Finder\SplFileInfo;
use Tests\TestCase;

class AIFilenameGeneratorTest extends TestCase
{
    public function test_generate_filename_integration()
    {
        // Skip the test if the FIREWORKS_API_KEY is not provided.
        if (empty(env('FIREWORKS_API_KEY'))) {
            $this->markTestSkipped('Fireworks API key not set in .env file.');
        }

        // Create a temporary directory for the test files.
        $tempDir = sys_get_temp_dir().'/ai_filename_generator_test_'.uniqid();
        mkdir($tempDir, 0777, true);

        // Define the relative paths for our dummy files.
        $relativePaths = [
            'src/Controller/UserController.php',
            'src/Model/User.php',
            'README.md',
        ];

        $files = [];
        // Create dummy files and wrap them in SplFileInfo.
        foreach ($relativePaths as $relativePath) {
            $fullPath = $tempDir.'/'.$relativePath;
            $dir = dirname($fullPath);
            if (! is_dir($dir)) {
                mkdir($dir, 0777, true);
            }
            // Write some dummy content.
            file_put_contents($fullPath, "Dummy content for {$relativePath}");
            // Create a SplFileInfo instance.
            $files[] = new SplFileInfo($fullPath, dirname($relativePath), $relativePath);
        }

        $generator = new AIFilenameGenerator;

        // Generate the filename using the Gemini API.
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

        // Cleanup temporary files.
        $this->removeDirectory($tempDir);
    }
}
