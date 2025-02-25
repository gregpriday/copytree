<?php

namespace App\Services;

class ByteCounter
{
    private static int $byteCount = 0;

    /**
     * Count bytes in the given text and add to the total
     */
    public static function count(string $text): int
    {
        $bytes = strlen($text);
        self::$byteCount += $bytes;

        return $bytes;
    }

    /**
     * Get the total byte count
     */
    public static function getTotal(): int
    {
        return self::$byteCount;
    }

    /**
     * Format the total bytes into a human-readable size
     */
    public static function getFormattedTotal(): string
    {
        return self::formatBytes(self::$byteCount);
    }

    /**
     * Reset the counter
     */
    public static function reset(): void
    {
        self::$byteCount = 0;
    }

    /**
     * Format bytes into a human-readable string
     */
    public static function formatBytes(int $bytes): string
    {
        $units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

        $bytes = max($bytes, 0);
        $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
        $pow = min($pow, count($units) - 1);

        // Convert to the appropriate unit
        $value = $bytes / pow(1024, $pow);

        // Determine precision based on the number's magnitude
        if ($value >= 100) {
            $precision = 0; // No decimal places for 3+ digits
        } elseif ($value >= 10) {
            $precision = 1; // 1 decimal place for 2 digits
        } else {
            $precision = 2; // 2 decimal places for 1 digit
        }

        return round($value, $precision).' '.$units[$pow];
    }
}
