<?php

namespace App\Transforms\Transformers\Markdown;

use App\Transforms\BaseTransformer;
use App\Transforms\FileTransformerInterface;
use Exception;
use League\CommonMark\CommonMarkConverter;
use League\CommonMark\Exception\CommonMarkException;
use RuntimeException;
use Symfony\Component\Finder\SplFileInfo;

/**
 * MarkdownStripper transforms Markdown content into plain text.
 *
 * It converts Markdown to HTML using league/commonmark, then strips out all HTML tags and decodes entities.
 * The resulting text is trimmed and whitespace-normalized.
 */
class MarkdownStripper extends BaseTransformer implements FileTransformerInterface
{
    /**
     * Transform the given Markdown input into plain text.
     *
     * @param  SplFileInfo|string  $input  The Markdown file or string.
     * @return string The plain text output.
     *
     * @throws RuntimeException If conversion fails.
     */
    public function transform(SplFileInfo|string $input): string
    {
        // Get the file content (or use the string directly)
        $markdown = $this->getContent($input);

        if (empty($markdown)) {
            return '';
        }

        // Instantiate the CommonMark converter with default settings.
        $converter = new CommonMarkConverter;

        try {
            // Convert Markdown to HTML.
            $html = $converter->convert($markdown)->getContent();
        } catch (Exception|CommonMarkException $e) {
            throw new RuntimeException('Markdown conversion failed: '.$e->getMessage());
        }

        // Strip HTML tags to leave only plain text.
        $plainText = strip_tags($html);

        // Decode HTML entities.
        $plainText = html_entity_decode($plainText, ENT_QUOTES | ENT_HTML5);

        // Normalize whitespace and trim the result.
        $plainText = trim(preg_replace('/\s+/', ' ', $plainText));

        return $plainText;
    }
}
