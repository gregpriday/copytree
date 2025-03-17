<?php

namespace App\Renderer;

use App\Services\ByteCounter;
use App\Transforms\FileTransformer;
use CzProject\GitPhp\GitRepository;
use Symfony\Component\Finder\SplFileInfo;

class FileOutputRenderer
{
    protected FileTransformer $transformer;
    
    /**
     * Git repository instance for retrieving file status information.
     */
    private ?GitRepository $gitRepo = null;
    
    /**
     * Cached list of files with uncommitted changes.
     */
    private ?array $modifiedFiles = null;

    /**
     * Constructor.
     *
     * @param  FileTransformer  $transformer  The file transformer instance.
     */
    public function __construct(FileTransformer $transformer)
    {
        $this->transformer = $transformer;
    }
    
    /**
     * Set the Git repository instance.
     * 
     * @param  GitRepository|null  $gitRepo  The Git repository instance, or null if not a Git repo.
     * @return void
     */
    public function setGitRepository(?GitRepository $gitRepo): void
    {
        $this->gitRepo = $gitRepo;
        $this->modifiedFiles = null; // Reset the list
        
        if ($this->gitRepo !== null) {
            try {
                // Fetch the Git status once when the repository is set
                $result = $this->gitRepo->run('status', '--porcelain');
                $statusLines = $result->getOutput();
                
                // Parse the porcelain status output
                $this->modifiedFiles = [];
                foreach ($statusLines as $line) {
                    if (strlen($line) > 3) {
                        $statusCode = substr($line, 0, 2);
                        $filePath = trim(substr($line, 3));
                        
                        // Check if the file is modified, added, or deleted
                        if ($statusCode !== '??') { // Not untracked
                            $this->modifiedFiles[] = $filePath;
                        }
                    }
                }
            } catch (\Exception $e) {
                // If there's an error getting Git status, continue without Git information
                $this->modifiedFiles = [];
            }
        }
    }

    /**
     * Render the file outputs.
     *
     * This method takes an array of SplFileInfo objects, applies the transformer
     * to get each file's content, and outputs a formatted string including metadata.
     * Metadata includes:
     * - path: Relative path to the file
     * - mime-type: MIME type of the file
     * - size: Formatted file size
     * - lines: Number of lines in the file
     * - modified-time: Last modification time in 'YYYY-MM-DD HH:MM:SS' format
     * - has-uncommitted-changes: 'true' or 'false' if in a Git repo, omitted otherwise
     * 
     * Optionally, it limits the output by a maximum number of lines and/or characters.
     *
     * @param  SplFileInfo[]  $files  Array of files to render.
     * @param  int  $maxLines  Maximum number of lines to show per file (0 for unlimited).
     * @param  int  $maxCharacters  Maximum number of characters to show per file (0 for unlimited).
     * @return string The rendered output.
     */
    public function render(array $files, int $maxLines = 0, int $maxCharacters = 0): string
    {
        $output = [];
        
        foreach ($files as $file) {
            $relativePath = $file->getRelativePathname();
            $mimeType = mime_content_type($file->getRealPath());
            $size = $this->formatFileSize($file->getSize());
            $lines = count(file($file->getRealPath()));
            
            // Get the last modified time
            try {
                $modifiedTime = date('Y-m-d H:i:s', filemtime($file->getRealPath()));
            } catch (\Exception $e) {
                $modifiedTime = 'unknown';
            }
            
            // Prepare attributes for XML tag
            $attributes = [
                'path' => htmlspecialchars($relativePath, ENT_QUOTES, 'UTF-8'),
                'mime-type' => htmlspecialchars($mimeType, ENT_QUOTES, 'UTF-8'),
                'size' => htmlspecialchars($size, ENT_QUOTES, 'UTF-8'),
                'lines' => $lines,
                'modified-time' => htmlspecialchars($modifiedTime, ENT_QUOTES, 'UTF-8'),
            ];
            
            // Add Git uncommitted changes indicator if in a Git repository
            if ($this->gitRepo !== null) {
                // Use pre-fetched list of modified files for better performance
                $hasUncommittedChanges = in_array($relativePath, $this->modifiedFiles, true);
                $attributes['has-uncommitted-changes'] = $hasUncommittedChanges ? 'true' : 'false';
            }
            
            // Build attribute string for XML tag
            $attributeString = '';
            foreach ($attributes as $key => $value) {
                $attributeString .= sprintf(' %s="%s"', $key, $value);
            }
            
            // Start file block
            $output[] = '<ct:file_contents' . $attributeString . '>';

            // Get the transformed file content.
            $content = $this->transformer->transform($file);

            // Count tokens in the content
            ByteCounter::count($content);

            // If maxLines is set, limit the content preview by lines.
            if ($maxLines > 0) {
                $linesArr = explode("\n", $content);
                if (count($linesArr) > $maxLines) {
                    $content = implode("\n", array_slice($linesArr, 0, $maxLines))
                        ."\n\n... [truncated after {$maxLines} lines] ...";
                }
            }

            // If maxCharacters is set, further limit the content preview by characters.
            if ($maxCharacters > 0 && mb_strlen($content) > $maxCharacters) {
                $content = mb_substr($content, 0, $maxCharacters)
                    ."\n\n... [truncated after {$maxCharacters} characters] ...";
            }

            $output[] = $content;
            $output[] = sprintf('</ct:file_contents> <!-- End of file: %s -->', $relativePath);
            $output[] = ''; // blank line between files
        }

        return implode("\n", $output);
    }

    /**
     * Count the number of files with pending transforms.
     */
    public function countPendingTransforms(array $files): int
    {
        return $this->transformer->countTransforms($files, true, false);
    }

    /**
     * Format a file size in bytes into a human-readable string.
     *
     * @param  int  $bytes  The size in bytes.
     * @return string The formatted file size.
     */
    protected function formatFileSize(int $bytes): string
    {
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $bytes = max($bytes, 0);
        $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
        $pow = min($pow, count($units) - 1);
        $bytes /= pow(1024, $pow);

        return round($bytes, 1).' '.$units[$pow];
    }
}
