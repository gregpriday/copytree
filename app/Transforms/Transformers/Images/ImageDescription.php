<?php

namespace App\Transforms\Transformers\Images;

use App\Transforms\BaseTransformer;
use App\Transforms\FileTransformerInterface;
use App\Transforms\Transformers\Loaders\FileLoader;
use Gemini\Enums\MimeType;
use Illuminate\Support\Facades\File;
use Gemini\Laravel\Facades\Gemini;
use Gemini\Data\Blob;
use RuntimeException;
use Symfony\Component\Finder\SplFileInfo;

class ImageDescription extends BaseTransformer implements FileTransformerInterface
{
    /**
     * Maximum bounding box dimension.
     */
    protected int $maxDimension = 1024;

    /**
     * Transform an image file into a text description using the Gemini API.
     * If the file is not an image, returns its content unchanged.
     *
     * @param  SplFileInfo|string  $input
     *
     * @throws RuntimeException
     */
    public function transform($input): string
    {
        // Ensure we have a SplFileInfo instance.
        if (! ($input instanceof SplFileInfo)) {
            throw new RuntimeException('ImageDescription transformer expects a SplFileInfo instance.');
        }

        // Check if the file is an image.
        $mimeType = File::mimeType($input->getRealPath());
        if (! str_starts_with($mimeType, 'image/')) {
            // If not an image, fall back to the default file loader transformer.
            return (new FileLoader)->transform($input);
        }

        // Use the caching helper to cache the expensive transformation.
        return $this->cacheTransformResult($input, function () use ($input, $mimeType) {
            // Resize the image if necessary.
            $resizedImageData = $this->resizeImage($input->getRealPath());

            // Base64-encode the (possibly resized) image data.
            $base64 = base64_encode($resizedImageData);

            // Load the system prompt from the prompts directory.
            $systemPromptPath = base_path('prompts/image-description/system.txt');
            if (! File::exists($systemPromptPath)) {
                throw new RuntimeException('System prompt for image description not found.');
            }
            $systemPrompt = File::get($systemPromptPath);

            // Create a combined prompt by appending the user instruction.
            $userInstruction = 'Please describe the image with the filename: ' . $input->getPath();
            $prompt = $systemPrompt . "\n\n===\n\n" . $userInstruction;

            // Call the Gemini API using the Gemini-Pro-Vision model.
            try {
                $response = Gemini::generativeModel(model: config('gemini.model'))
                    ->generateContent([
                    $prompt,
                    new Blob(
                        mimeType: MimeType::IMAGE_JPEG,
                        data: $base64
                    )
                ]);
            } catch (\Exception $e) {
                throw new RuntimeException('Gemini API call failed: ' . $e->getMessage());
            }

            // Extract and return the text description.
            $description = $response->text() ?? '';
            if (empty($description)) {
                throw new RuntimeException('No description returned from Gemini.');
            }

            return $description;
        });
    }

    /**
     * Resize an image to fit within a maximum bounding box.
     *
     * This method uses the GD library to resize the image so that its width and height
     * do not exceed $maxDimension while preserving the aspect ratio. If the image is
     * already within the desired bounds, the original image data is returned.
     *
     * @param  string  $imagePath  The path to the original image file.
     * @return string The (possibly resized) image data.
     */
    private function resizeImage(string $imagePath): string
    {
        // Get the original dimensions and image type.
        $imageInfo = getimagesize($imagePath);
        if ($imageInfo === false) {
            throw new RuntimeException("Unable to get image size for {$imagePath}");
        }
        [$width, $height, $imageType] = $imageInfo;

        // If the image is already within the maximum dimensions, return its contents.
        if ($width <= $this->maxDimension && $height <= $this->maxDimension) {
            return file_get_contents($imagePath);
        }

        // Calculate new dimensions while preserving aspect ratio.
        $ratio = min($this->maxDimension / $width, $this->maxDimension / $height);
        $newWidth = (int) ($width * $ratio);
        $newHeight = (int) ($height * $ratio);

        // Load the original image based on its type.
        switch ($imageType) {
            case IMAGETYPE_JPEG:
                $srcImage = imagecreatefromjpeg($imagePath);
                break;
            case IMAGETYPE_PNG:
                $srcImage = imagecreatefrompng($imagePath);
                break;
            case IMAGETYPE_GIF:
                $srcImage = imagecreatefromgif($imagePath);
                break;
            default:
                // If unsupported, return the original image.
                return file_get_contents($imagePath);
        }

        // Create a new true color image for the resized version.
        $dstImage = imagecreatetruecolor($newWidth, $newHeight);

        // Preserve transparency for PNG and GIF images.
        if ($imageType == IMAGETYPE_PNG) {
            imagealphablending($dstImage, false);
            imagesavealpha($dstImage, true);
        } elseif ($imageType == IMAGETYPE_GIF) {
            $transparentIndex = imagecolortransparent($srcImage);
            if ($transparentIndex >= 0) {
                $transparentColor = imagecolorsforindex($srcImage, $transparentIndex);
                $transparentIndex = imagecolorallocate($dstImage, $transparentColor['red'], $transparentColor['green'], $transparentColor['blue']);
                imagefill($dstImage, 0, 0, $transparentIndex);
                imagecolortransparent($dstImage, $transparentIndex);
            }
        }

        // Resample the original image into the new resized image.
        imagecopyresampled($dstImage, $srcImage, 0, 0, 0, 0, $newWidth, $newHeight, $width, $height);

        // Open a temporary memory stream.
        $stream = fopen('php://memory', 'r+');
        imagejpeg($dstImage, $stream);

        // Rewind the stream and read its contents.
        rewind($stream);
        $resizedImageData = stream_get_contents($stream);
        fclose($stream);

        // Free memory.
        imagedestroy($srcImage);
        imagedestroy($dstImage);

        return $resizedImageData;
    }
}
