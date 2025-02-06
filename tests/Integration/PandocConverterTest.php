<?php

namespace Tests\Integration;

use App\Services\PandocConverter;
use Symfony\Component\Finder\SplFileInfo;
use Tests\TestCase;

class PandocConverterTest extends TestCase
{
    /**
     * Path to the fixtures directory.
     */
    protected string $fixturesPath;

    protected function setUp(): void
    {
        parent::setUp();
    }

    public function test_convert_to_text_for_docx_file()
    {
        // Path to a sample DOCX file stored as a fixture
        $filePath = $this->getFixturesPath('/sample.docx');
        $this->assertFileExists($filePath, 'The fixture file sample.docx must exist.');

        // Create a SplFileInfo instance for the sample file.
        $fileInfo = new SplFileInfo($filePath, '', 'sample.docx');

        $converter = new PandocConverter;
        $outputText = $converter->convertToText($fileInfo);

        // Assert that the output contains a known substring from sample.docx.
        // For example, if you know sample.docx contains the phrase "Welcome to the Test Document"
        $this->assertStringContainsString('This is a test document', $outputText);
    }
}
