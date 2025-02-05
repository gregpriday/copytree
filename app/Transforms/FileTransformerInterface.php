<?php

namespace App\Transforms;

use Symfony\Component\Finder\SplFileInfo;

interface FileTransformerInterface
{
    /**
     * Transform the given input into a string.
     *
     * The input can be either a Symfony Finder SplFileInfo object or a string.
     */
    public function transform(SplFileInfo|string $input): string;
}
