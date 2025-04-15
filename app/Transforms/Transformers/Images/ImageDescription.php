<?php

namespace App\Transforms\Transformers\Images;

use App\Facades\AI;
use App\Transforms\BaseTransformer;
use App\Transforms\FileTransformerInterface;
use App\Transforms\Transformers\Loaders\FileLoader;
use Illuminate\Support\Facades\File;
use RuntimeException;
use Symfony\Component\Finder\SplFileInfo;

class ImageDescription extends BaseTransformer implements FileTransformerInterface
{
    /**
     * Maximum bounding box dimension.
     */
    protected int $maxDimension = 1024;

    /**
     * Transform an image file into a text description using the AI API.
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
        return $this->cacheTransformResult($input, function () use ($input) {
            // Resize the image if necessary.
            $resizedImageData = $this->resizeImage($input->getRealPath());

            // Base64-encode the (possibly resized) image data.
            $base64 = base64_encode($resizedImageData);

            // Load the system prompt from the prompts directory.
            $systemPromptPath = base_path('prompts/image-description/system.txt');
            if (! File::exists($systemPromptPath)) {
                \Illuminate\Support\Facades\Log::error('System prompt for image description not found at: '.$systemPromptPath);
                throw new RuntimeException('System prompt for image description not found.');
            }
            $systemPrompt = File::get($systemPromptPath);

            // Create a combined prompt by appending the user instruction.
            $userInstruction = 'Please describe the image with the filename: '.$input->getPath();

            // Call the AI API with the base64-encoded image
            $response = AI::driver('openai')->chat()->create([
                'model' => AI::models('openai')['medium'],
                'messages' => [
                    ['role' => 'system', 'content' => $systemPrompt],
                    ['role' => 'user', 'content' => [
                        ['type' => 'text', 'text' => $userInstruction],
                        [
                            'type' => 'image_url',
                            'image_url' => [
                                'url' => 'data:image/jpeg;base64,'.$base64,
                            ],
                        ],
                    ]],
                ],
                'max_tokens' => 1024,
                'temperature' => 0.2,
            ]);

            // Extract the response content
            $description = $response->choices[0]->message->content ?? '';

            if (empty($description)) {
                throw new RuntimeException('No description returned from AI.');
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
            \Illuminate\Support\Facades\Log::error('Unable to get image size for '.$imagePath);
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
