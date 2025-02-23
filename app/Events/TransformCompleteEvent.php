<?php

namespace App\Events;

use App\Transforms\BaseTransformer;
use Symfony\Component\Finder\SplFileInfo;

class TransformCompleteEvent
{
    /**
     * The transformer instance.
     *
     * @var mixed
     */
    public $transformer;

    /**
     * The file being processed.
     */
    public SplFileInfo $file;

    public string $content;

    /**
     * Create a new TransformerEvent.
     *
     * @param  mixed  $transformer  The transformer instance or its identifier.
     * @param  SplFileInfo  $file  The file being transformed.
     */
    public function __construct(BaseTransformer $transformer, SplFileInfo $file, string $content)
    {
        $this->transformer = $transformer;
        $this->file = $file;
        $this->content = $content;
    }
}
