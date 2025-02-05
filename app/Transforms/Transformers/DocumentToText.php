<?php

namespace App\Transforms\Transformers;

use App\Services\PandocConverter;
use App\Transforms\FileTransformerInterface;
use RuntimeException;
use Symfony\Component\Finder\SplFileInfo;

class DocumentToText implements FileTransformerInterface
{
    /**
     * The document conversion service instance.
     */
    protected PandocConverter $converter;

    /**
     * Constructor.
     *
     * Here we instantiate the document conversion service.
     */
    public function __construct()
    {
        $this->converter = new PandocConverter;
    }

    /**
     * Transform the input file by converting it to plain text.
     *
     * The input is expected to be a SplFileInfo instance. If not, a RuntimeException is thrown.
     *
     * @param  SplFileInfo|string  $input  The file to transform.
     * @return string The text output after conversion.
     *
     * @throws RuntimeException If the input is not a SplFileInfo instance.
     */
    public function transform(SplFileInfo|string $input): string
    {
        if (! $input instanceof SplFileInfo) {
            throw new RuntimeException('DocumentToTextTransformer expects a SplFileInfo instance.');
        }

        return $this->converter->convertToText($input);
    }

    public static function canConvert(SplFileInfo $inputFile): bool
    {
        // This method uses the PandocConverter's list of convertible MIME types.
        return PandocConverter::canConvert($inputFile);
    }
}
