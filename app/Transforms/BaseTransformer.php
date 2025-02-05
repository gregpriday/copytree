<?php

namespace App\Transforms;

use Illuminate\Support\Facades\File;
use RuntimeException;
use Symfony\Component\Finder\SplFileInfo;

abstract class BaseTransformer
{
    /**
     * Retrieve content from the input.
     *
     * If the input is a SplFileInfo (a file), this reads its content.
     * If the input is already a string, it is returned directly.
     *
     * @throws RuntimeException If the file cannot be read.
     */
    protected function getContent(SplFileInfo|string $input): string
    {
        if ($input instanceof SplFileInfo) {
            try {
                return File::get($input->getRealPath());
            } catch (\Exception $e) {
                throw new RuntimeException('Unable to read file: '.$input->getRealPath());
            }
        }

        return $input;
    }
}
