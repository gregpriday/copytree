<?php

namespace App\Transforms\Transformers;

use App\Transforms\BaseTransformer;
use App\Transforms\FileTransformerInterface;
use Illuminate\Support\Facades\File;
use OpenAI\Laravel\Facades\OpenAI;
use RuntimeException;
use Symfony\Component\Finder\SplFileInfo;

class ImageDescription extends BaseTransformer implements FileTransformerInterface
{
    /**
     * Transform an image file into a text description using the OpenAI API.
     * If the file is not an image, return its content unchanged.
     *
     * @param  SplFileInfo|string  $input
     */
    public function transform($input): string
    {
        // Ensure we have a SplFileInfo instance.
        if (! ($input instanceof SplFileInfo)) {
            throw new RuntimeException('ImageDescriptionTransformer expects a SplFileInfo instance.');
        }

        // Check if the file is an image.
        $mimeType = File::mimeType($input->getRealPath());
        if (strpos($mimeType, 'image/') !== 0) {
            // If not an image, fall back to the default file loader transformer.
            return (new DefaultFileLoader)->transform($input);
        }

        // Read the image data using Laravel's File facade and encode it as base64.
        $imageData = File::get($input->getRealPath());
        if ($imageData === false) {
            throw new RuntimeException('Failed to read image file.');
        }
        $base64 = base64_encode($imageData);
        $dataUrl = 'data:'.$mimeType.';base64,'.$base64;

        // Load the system prompt from the prompts directory using the File facade.
        $systemPromptPath = base_path('prompts/image-description/system.txt');
        if (! File::exists($systemPromptPath)) {
            throw new RuntimeException('System prompt for image description not found.');
        }
        $systemPrompt = File::get($systemPromptPath);

        // Prepare the messages: a system prompt and a user message that includes the image.
        $messages = [
            ['role' => 'system', 'content' => $systemPrompt],
            ['role' => 'user', 'content' => [
                ['type' => 'text', 'text' => 'Please describe the image.'],
                ['type' => 'image_url', 'image_url' => ['url' => $dataUrl]],
            ]],
        ];

        // Call the OpenAI API using the Facade.
        try {
            $response = OpenAI::chat()->create([
                'model' => config('openai.model', 'gpt-4o'),
                'messages' => $messages,
                'temperature' => 0.3,
                'max_tokens' => 300,
            ]);
        } catch (\Exception $e) {
            throw new RuntimeException('OpenAI API call failed: '.$e->getMessage());
        }

        // Extract and return the text description.
        $description = $response->choices[0]->message->content ?? '';
        if (empty($description)) {
            throw new RuntimeException('No description returned from OpenAI.');
        }

        return $description;
    }
}
