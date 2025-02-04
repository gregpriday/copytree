<?php

namespace App\Transforms;

use Symfony\Component\Finder\SplFileInfo;

interface FileTransformInterface
{
    /**
     * Transform the given input into a string.
     *
     * The input can be either a Symfony Finder SplFileInfo object or a string.
     *
     * @param SplFileInfo|string $input
     * @return string
     */
    public function transform(SplFileInfo|string $input): string;
}
