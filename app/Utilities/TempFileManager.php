<?php

namespace App\Utilities;

use DirectoryIterator;
use App\Services\AIFilenameGenerator;

class TempFileManager
{
    public const MAX_AGE_MINUTES = 1440; // 24 hours

    public const PREFIX = 'ctree_output_';

    /**
     * Get the temporary directory for storing copytree output files.
     *
     * @return string The full path to the temporary directory.
     */
    public static function getTempDir(): string
    {
        $baseDir = sys_get_temp_dir();
        $ctreeDir = $baseDir.DIRECTORY_SEPARATOR.'ctree';

        if (! is_dir($ctreeDir)) {
            mkdir($ctreeDir, 0777, true);
        }

        return $ctreeDir;
    }

    /**
     * Create a temporary file with the given content.
     *
     * Generates a filename using a timestamp and a hash of the content.
     *
     * @param  string  $content  The content to save in the temporary file.
     * @return string The full path to the created temporary file.
     */
    public static function createTempFile(string $content): string
    {
        $tempDir = self::getTempDir();
        $timestamp = date('Y-m-d_H-i-s');
        $hash = substr(hash('sha256', $content.uniqid()), 0, 16);
        $filename = $hash . '_' . $timestamp . '.txt';
        $filepath = $tempDir.DIRECTORY_SEPARATOR.$filename;

        try {
            if (file_put_contents($filepath, $content) === false) {
                throw new \RuntimeException('Failed to write temp file: ' . $filepath);
            }
        } catch (\Exception $e) {
            if (class_exists('\\Illuminate\\Support\\Facades\\Log')) {
                \Illuminate\Support\Facades\Log::error('TempFileManager: Failed to create temp file ' . $filepath . ': ' . $e->getMessage());
            }
            throw new \RuntimeException('Failed to create temp file: ' . $filepath . '. Error: ' . $e->getMessage());
        }

        return $filepath;
    }

    /**
     * Remove temporary files older than the maximum age.
     *
     * Scans the temporary directory and deletes files whose names start with the
     * defined prefix and have a modification time older than the specified maximum.
     */
    public static function cleanOldFiles(): void
    {
        $tempDir = self::getTempDir();
        $maxAge = time() - (self::MAX_AGE_MINUTES * 60);
        $debugEnabled = env('TEMP_FILE_DEBUG', false);
        
        if ($debugEnabled && class_exists('\Illuminate\Support\Facades\Log')) {
            \Illuminate\Support\Facades\Log::info("TempFileManager: Starting cleanup. Current time: " . time() . ", Max age threshold: " . $maxAge);
        }

        // Ensure MAX_AGE_MINUTES is reasonable (prevent accidental deletion of all files)
        if (self::MAX_AGE_MINUTES < 10) {
            if (class_exists('\Illuminate\Support\Facades\Log')) {
                \Illuminate\Support\Facades\Log::warning("TempFileManager: MAX_AGE_MINUTES is set too low (" . self::MAX_AGE_MINUTES . "). Skipping cleanup to prevent accidental deletion.");
            }
            return;
        }

        $deletedCount = 0;
        $totalCount = 0;

        foreach (new DirectoryIterator($tempDir) as $fileInfo) {
            if ($fileInfo->isFile() && pathinfo($fileInfo->getFilename(), PATHINFO_EXTENSION) === 'txt') {
                $totalCount++;
                
                // Safely get the modification time
                try {
                    $modTime = $fileInfo->getMTime();
                    if ($modTime === false || $modTime === 0) {
                        // Skip files where we can't determine the modification time
                        if ($debugEnabled && class_exists('\Illuminate\Support\Facades\Log')) {
                            \Illuminate\Support\Facades\Log::warning("TempFileManager: Could not get modification time for " . $fileInfo->getFilename());
                        }
                        continue;
                    }
                } catch (\Exception $e) {
                    // Log error and skip this file
                    if (class_exists('\Illuminate\Support\Facades\Log')) {
                        \Illuminate\Support\Facades\Log::error("TempFileManager: Error getting file info: " . $e->getMessage());
                    }
                    continue;
                }
                
                $fileName = $fileInfo->getFilename();
                $isOld = $modTime < $maxAge;
                
                if ($debugEnabled && class_exists('\Illuminate\Support\Facades\Log')) {
                    \Illuminate\Support\Facades\Log::info("TempFileManager: File: {$fileName}, Mod Time: {$modTime}, Is Old: " . ($isOld ? 'Yes' : 'No'));
                }
                
                if ($isOld) {
                    // Safety check: don't delete everything
                    if ($deletedCount > 0 && $deletedCount >= $totalCount * 0.9) {
                        if (class_exists('\Illuminate\Support\Facades\Log')) {
                            \Illuminate\Support\Facades\Log::warning("TempFileManager: Safety threshold reached. Stopping cleanup to prevent deleting all files.");
                        }
                        break;
                    }
                    
                    try {
                        if ($debugEnabled && class_exists('\Illuminate\Support\Facades\Log')) {
                            \Illuminate\Support\Facades\Log::info("TempFileManager: Deleting old file: {$fileName}");
                        }
                        
                        unlink($fileInfo->getPathname());
                        $deletedCount++;
                    } catch (\Exception $e) {
                        if (class_exists('\Illuminate\Support\Facades\Log')) {
                            \Illuminate\Support\Facades\Log::error("TempFileManager: Failed to delete file {$fileName}: " . $e->getMessage());
                        }
                    }
                }
            }
        }
        
        if ($debugEnabled && class_exists('\Illuminate\Support\Facades\Log')) {
            \Illuminate\Support\Facades\Log::info("TempFileManager: Cleanup completed. Deleted {$deletedCount} of {$totalCount} files.");
        }
    }

    /**
     * Create a temporary file with the given content, using AI to generate a descriptive filename.
     *
     * @param  string  $content  The content to save in the temporary file.
     * @param  array  $files  The files used to generate the content, for providing context to the AI.
     * @return string The full path to the created temporary file.
     */
    public static function createAITempFile(string $content, array $files = []): string
    {
        $tempDir = self::getTempDir();
        
        try {
            // Generate a descriptive filename using AI
            $aiGenerator = app(AIFilenameGenerator::class);
            $descriptiveFilename = $aiGenerator->generateFilenameFromFiles($files);
            
            // Add timestamp to ensure uniqueness
            $timestamp = date('Y-m-d_H-i-s');
            // Modified to place AI-generated name first, followed by timestamp
            // Note: descriptiveFilename already includes .txt extension from AIFilenameGenerator
            $filename = str_replace('.txt', '', $descriptiveFilename) . '_' . $timestamp . '.txt';
            $filepath = $tempDir . DIRECTORY_SEPARATOR . $filename;
            
            file_put_contents($filepath, $content);
            
            return $filepath;
        } catch (\Exception $e) {
            // Log the error
            if (class_exists('\Illuminate\Support\Facades\Log')) {
                \Illuminate\Support\Facades\Log::warning('Failed to generate AI filename: '.$e->getMessage());
            }
            
            // Fall back to standard temp file creation
            return self::createTempFile($content);
        }
    }
}
