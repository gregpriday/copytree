<?php

namespace App\Transforms\Transformers\HTML;

use App\Transforms\BaseTransformer;
use App\Transforms\FileTransformerInterface;
use Symfony\Component\Finder\SplFileInfo;

class HTMLStripper extends BaseTransformer implements FileTransformerInterface
{
    public function transform(SplFileInfo|string $input): string
    {
        $content = $this->getContent($input);

        // Remove <script>...</script>, <style>...</style>, etc.
        $content = preg_replace('#<script.*?>.*?</script>#is', '', $content);
        $content = preg_replace('#<style.*?>.*?</style>#is', '', $content);

        // Strip remaining HTML tags.
        $content = strip_tags($content);

        // Optionally decode HTML entities, normalize whitespace, etc.
        $content = html_entity_decode($content, ENT_QUOTES | ENT_HTML5);
        $content = preg_replace('/\s+/', ' ', $content);

        return trim($content);
    }
}
