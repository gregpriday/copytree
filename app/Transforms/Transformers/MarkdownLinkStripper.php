<?php

namespace App\Transforms\Transformers;

use App\Transforms\BaseTransformer;
use App\Transforms\FileTransformerInterface;
use RuntimeException;
use Symfony\Component\Finder\SplFileInfo;

class MarkdownLinkStripper extends BaseTransformer implements FileTransformerInterface
{
    /**
     * Transform the given input by replacing Markdown links with only their text.
     *
     * This method uses a robust regex to match Markdown links (e.g. [Link text](URL))
     * even if they span multiple lines, and replaces them with just the link text.
     *
     * @param  SplFileInfo|string  $input  The Markdown text or file.
     * @return string The content with Markdown links replaced by their text.
     *
     * @throws RuntimeException
     */
    public function transform(SplFileInfo|string $input): string
    {
        // Retrieve the content using the base class method.
        $content = $this->getContent($input);

        // Define a regex pattern to match Markdown links.
        // (?<!\!) ensures that image links (which start with "!") are not matched.
        // The /s modifier allows the dot (.) to match newline characters.
        $pattern = '/(?<!\!)\[(.*?)\]\((.*?)\)/s';

        // Replace each Markdown link with only the text inside the square brackets.
        $result = preg_replace_callback($pattern, function ($matches) {
            // $matches[1] holds the link text.
            return trim($matches[1]);
        }, $content);

        return $result;
    }
}
