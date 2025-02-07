<?php

namespace Tests\Integration;

use App\Transforms\Transformers\Images\ImageDescription;
use Symfony\Component\Finder\SplFileInfo;
use Tests\TestCase;

class ImageDescriptionTest extends TestCase
{
    public function test_transform_returns_description_for_image()
    {
        // Skip this integration test if the OpenAI API key is not set.
        if (empty(env('OPENAI_API_KEY'))) {
            $this->markTestSkipped('OPENAI_API_KEY is not set. Skipping ImageDescription integration test.');
        }

        // Get the path to the test image.
        $imagePath = $this->getFixturesPath('painting.jpg');

        // Ensure the fixture image exists.
        $this->assertFileExists($imagePath, 'The fixture image (painting.jpg) does not exist in tests/Fixtures.');

        // Create a SplFileInfo instance for the image.
        $file = new SplFileInfo($imagePath, '', 'painting.jpg');

        // Instantiate the ImageDescription transformer.
        $transformer = new ImageDescription;

        // Call transform to get the image description.
        $description = $transformer->transform($file);

        // Assert that a non-empty string is returned.
        $this->assertIsString($description, 'The returned description is not a string.');
        $this->assertNotEmpty($description, 'The returned description is empty.');
        $this->assertStringContainsString('cat', $description, 'The description does not contain the expected word "cat".');

        // Optionally, output the description for debugging.
        fwrite(STDOUT, 'Image description: '.$description."\n");
    }
}
