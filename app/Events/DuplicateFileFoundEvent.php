<?php

namespace App\Events;

use Symfony\Component\Finder\SplFileInfo;

class DuplicateFileFoundEvent
{
    public SplFileInfo $file;

    public function __construct(SplFileInfo $file)
    {
        $this->file = $file;
    }
}
