<?php

namespace Tests\Unit\Transforms\Transformers;

use App\Transforms\Transformers\Images\SvgDescription;
use Symfony\Component\Finder\SplFileInfo;
use Tests\TestCase;

class SvgDescriptionTest extends TestCase
{
    /** @var SvgDescription */
    private $transformer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->transformer = new SvgDescription;
    }

    public function test_transform_returns_description_for_valid_svg()
    {
        // Get the path to the test SVG
        $svgPath = $this->getFixturesPath('svg/valid.svg');

        // Ensure the fixture SVG exists
        $this->assertFileExists($svgPath, 'The fixture SVG (valid.svg) does not exist in tests/Fixtures/svg/.');

        // Create a SplFileInfo instance for the SVG
        $file = new SplFileInfo($svgPath, '', 'valid.svg');

        // Call transform to get the SVG description
        $description = $this->transformer->transform($file);

        // Assert that the description contains expected content
        $this->assertIsString($description);
        $this->assertNotEmpty($description);
        $this->assertStringContainsString('SVG vector graphic', $description);
        $this->assertStringContainsString('Test SVG', $description);
        $this->assertStringContainsString('100', $description);
    }

    public function test_transform_handles_invalid_svg_gracefully()
    {
        // Get the path to the invalid test SVG
        $svgPath = $this->getFixturesPath('svg/invalid.svg');

        // Ensure the fixture SVG exists
        $this->assertFileExists($svgPath, 'The fixture SVG (invalid.svg) does not exist in tests/Fixtures/svg/.');

        // Create a SplFileInfo instance for the SVG
        $file = new SplFileInfo($svgPath, '', 'invalid.svg');

        // Call transform to get the SVG description - this should not throw an exception
        $description = $this->transformer->transform($file);

        // Assert that the description indicates failure but doesn't break the process
        $this->assertIsString($description);
        $this->assertNotEmpty($description);
        $this->assertStringContainsString('SVG parsing failed', $description);
        $this->assertStringContainsString('invalid.svg', $description);
    }
}
