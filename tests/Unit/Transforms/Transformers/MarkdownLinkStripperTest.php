<?php

namespace Tests\Unit\Transforms\Transformers;

use App\Transforms\Transformers\MarkdownLinkStripper;
use PHPUnit\Framework\TestCase;

class MarkdownLinkStripperTest extends TestCase
{
    /**
     * Test that a simple markdown link is replaced with its link text.
     */
    public function test_transform_replaces_markdown_links_with_link_text(): void
    {
        $markdown = 'This is a [link](http://example.com) in a sentence.';
        $expected = 'This is a link in a sentence.';

        $stripper = new MarkdownLinkStripper;
        $result = $stripper->transform($markdown);

        $this->assertEquals($expected, $result);
    }

    /**
     * Test that image links (which begin with an exclamation mark) are not modified.
     */
    public function test_transform_does_not_replace_image_links(): void
    {
        $markdown = 'This is an image ![alt text](http://example.com/image.png) in a sentence.';
        // The image markdown should remain unchanged.
        $expected = 'This is an image ![alt text](http://example.com/image.png) in a sentence.';

        $stripper = new MarkdownLinkStripper;
        $result = $stripper->transform($markdown);

        $this->assertEquals($expected, $result);
    }

    /**
     * Test that multiple markdown links in one text are all replaced.
     */
    public function test_transform_handles_multiple_links(): void
    {
        $markdown = 'First [link one](http://one.com) and second [link two](http://two.com).';
        $expected = 'First link one and second link two.';

        $stripper = new MarkdownLinkStripper;
        $result = $stripper->transform($markdown);

        $this->assertEquals($expected, $result);
    }

    /**
     * Test that text with no markdown links is returned unchanged.
     */
    public function test_transform_handles_no_links(): void
    {
        $markdown = 'This text has no links.';
        $expected = 'This text has no links.';

        $stripper = new MarkdownLinkStripper;
        $result = $stripper->transform($markdown);

        $this->assertEquals($expected, $result);
    }

    /**
     * Test that the transformer correctly handles a markdown link that spans multiple lines.
     */
    public function test_transform_handles_multiline_markdown_link(): void
    {
        $markdown = "A link with [multiline\nlink text](http://example.com) in it.";
        $expected = "A link with multiline\nlink text in it.";

        $stripper = new MarkdownLinkStripper;
        $result = $stripper->transform($markdown);

        $this->assertEquals($expected, $result);
    }
}
