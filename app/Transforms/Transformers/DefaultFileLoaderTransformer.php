<?php

namespace App\Transforms\Transformers;

use App\Transforms\FileTransformInterface;
use Illuminate\Support\Facades\File;
use Symfony\Component\Finder\SplFileInfo;

class DefaultFileLoaderTransformer implements FileTransformInterface
{
    /**
     * Transform the given input into a string.
     *
     * @param SplFileInfo|string $input
     * @return string
     */
    public function transform(SplFileInfo|string $input): string
    {
        if ($input instanceof SplFileInfo) {
            return File::get($input->getRealPath());
        }

        return $input;
    }
}
