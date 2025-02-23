<?php

namespace App\Transforms;

trait SlowTransformerTrait
{
    /**
     * Indicates that this transformer is heavy and should be counted toward progress reporting.
     *
     * Heavy transformers typically perform time‑consuming operations.
     *
     * @return bool Always returns true.
     */
    public function isHeavy(): bool
    {
        return true;
    }
}
