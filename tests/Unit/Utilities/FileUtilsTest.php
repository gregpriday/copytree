<?php

namespace Tests\Unit\Utilities;

use App\Utilities\FileUtils;
use Tests\TestCase;

class FileUtilsTest extends TestCase
{
    /**
     * Test that countLinesEfficiently correctly counts lines in a file.
     */
    public function test_count_lines_efficiently()
    {
        // Create a temporary file with known content
        $tempFile = tempnam(sys_get_temp_dir(), 'line_count_test');
        $content = "line 1\nline 2\nline 3\n";
        file_put_contents($tempFile, $content);

        // Count lines
        $lineCount = FileUtils::countLinesEfficiently($tempFile);

        // Assert line count is correct (3 lines)
        $this->assertEquals(3, $lineCount);

        // Clean up
        unlink($tempFile);
    }

    /**
     * Test that countLinesEfficiently handles a file without a trailing newline.
     */
    public function test_count_lines_without_trailing_newline()
    {
        // Create a temporary file without a trailing newline
        $tempFile = tempnam(sys_get_temp_dir(), 'line_count_test');
        $content = "line 1\nline 2\nline 3"; // No trailing newline
        file_put_contents($tempFile, $content);

        // Count lines
        $lineCount = FileUtils::countLinesEfficiently($tempFile);

        // Assert line count is correct (3 lines)
        $this->assertEquals(3, $lineCount);

        // Clean up
        unlink($tempFile);
    }

    /**
     * Test that countLinesEfficiently handles empty files.
     */
    public function test_count_lines_empty_file()
    {
        // Create an empty temporary file
        $tempFile = tempnam(sys_get_temp_dir(), 'line_count_test');
        file_put_contents($tempFile, '');

        // Count lines
        $lineCount = FileUtils::countLinesEfficiently($tempFile);

        // Assert line count is 0
        $this->assertEquals(0, $lineCount);

        // Clean up
        unlink($tempFile);
    }

    /**
     * Test that countLinesEfficiently handles non-existent files.
     */
    public function test_count_lines_nonexistent_file()
    {
        // Count lines in a non-existent file
        $lineCount = FileUtils::countLinesEfficiently('/path/to/nonexistent/file');

        // Assert it returns -1 to indicate failure
        $this->assertEquals(-1, $lineCount);
    }

    /**
     * Test handling of a larger file (more than one buffer size).
     */
    public function test_count_lines_larger_file()
    {
        // Create a temporary file with content larger than the buffer size
        $tempFile = tempnam(sys_get_temp_dir(), 'line_count_test');

        // Generate content with approximately 10,000 lines
        $content = '';
        $expectedLineCount = 10000;
        for ($i = 0; $i < $expectedLineCount; $i++) {
            $content .= "This is line $i\n";
        }
        file_put_contents($tempFile, $content);

        // Count lines
        $lineCount = FileUtils::countLinesEfficiently($tempFile);

        // Assert line count is correct
        $this->assertEquals($expectedLineCount, $lineCount);

        // Clean up
        unlink($tempFile);
    }
}
