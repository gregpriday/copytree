<?php

namespace App\Commands;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use LaravelZero\Framework\Commands\Command;

class InstallCursorCommand extends Command
{
    /**
     * The signature of the command.
     *
     * @var string
     */
    protected $signature = 'install:cursor';

    /**
     * The description of the command.
     *
     * @var string
     */
    protected $description = 'Installs or updates the CopyTree MCP server configuration in the project\'s .cursor/mcp.json file.';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        // Get the current working directory (project root)
        $cwd = getcwd();
        if ($cwd === false) {
             $this->error('Could not determine the current working directory.');
             return self::FAILURE;
        }
        $cursorDir = $cwd . DIRECTORY_SEPARATOR . '.cursor';
        $targetFile = $cursorDir . DIRECTORY_SEPARATOR . 'mcp.json';
        $oldRuleFileDir = $cursorDir . DIRECTORY_SEPARATOR . 'rules';
        $oldRuleFile = $oldRuleFileDir . DIRECTORY_SEPARATOR . 'copytree.mdc';
        $oldRuleFileDirect = $cursorDir . DIRECTORY_SEPARATOR . 'copytree.mdc'; // Check direct location too

        // Step 1: Ensure the target .cursor directory exists
        if (!File::isDirectory($cursorDir)) {
            if (File::makeDirectory($cursorDir, 0755, true)) {
                $this->info('Created directory: ' . $cursorDir);
            } else {
                $this->error('Failed to create directory: ' . $cursorDir);
                return self::FAILURE;
            }
        } else {
             $this->comment('Directory already exists: ' . $cursorDir);
        }


        // Step 2: Delete the old copytree.mdc file if it exists
        $this->deleteOldRuleFile($oldRuleFile);
        $this->deleteOldRuleFile($oldRuleFileDirect);
        // Attempt to remove the old rules directory if empty
        if (is_dir($oldRuleFileDir) && count(scandir($oldRuleFileDir)) == 2) { // Checks for '.' and '..'
            @rmdir($oldRuleFileDir);
        }


        // Step 3: Load the default configuration from resources/mcp.json
        $sourceFile = base_path('resources/mcp.json');
        if (!File::exists($sourceFile)) {
            $this->error('Source configuration file does not exist: ' . $sourceFile);
            $this->error('Please ensure resources/mcp.json is created with the default server definition.');
            return self::FAILURE;
        }

        try {
             $defaultJsonContent = File::get($sourceFile);
             $defaultConfig = json_decode($defaultJsonContent, true);
             if (json_last_error() !== JSON_ERROR_NONE) {
                 $this->error('Failed to decode default configuration from ' . $sourceFile . ': ' . json_last_error_msg());
                 return self::FAILURE;
             }
             // Ensure the default config has the expected structure
             if (!isset($defaultConfig['mcpServers']['copytree-server'])) {
                  $this->error('Default configuration in ' . $sourceFile . ' is missing the mcpServers.copytree-server key.');
                  return self::FAILURE;
             }
             $copytreeServerConfig = $defaultConfig['mcpServers']['copytree-server'];

        } catch (\Exception $e) {
             $this->error('Error reading default configuration file ' . $sourceFile . ': ' . $e->getMessage());
             return self::FAILURE;
        }


        // Step 4: Handle existing or new mcp.json
        $mcpConfig = [];
        if (File::exists($targetFile)) {
            $this->comment('Existing configuration file found: ' . $targetFile);
             try {
                 $existingJsonContent = File::get($targetFile);
                 $mcpConfig = json_decode($existingJsonContent, true);
                 if (json_last_error() !== JSON_ERROR_NONE) {
                     $this->warn('Could not decode existing JSON file ' . $targetFile . '. It might be corrupted. Will overwrite with default CopyTree config. Error: ' . json_last_error_msg());
                     $mcpConfig = ['mcpServers' => []]; // Reset to ensure structure
                 }
                 // Ensure mcpServers key exists and is an array/object
                 if (!isset($mcpConfig['mcpServers']) || !is_array($mcpConfig['mcpServers'])) {
                      $this->warn('Existing ' . $targetFile . ' does not have a valid "mcpServers" array/object. Adding/overwriting CopyTree server config.');
                      $mcpConfig['mcpServers'] = []; // Ensure the key exists as an array
                 }
             } catch (\Exception $e) {
                  $this->warn('Error reading existing configuration file ' . $targetFile . ': ' . $e->getMessage() . '. Will overwrite with default CopyTree config.');
                  $mcpConfig = ['mcpServers' => []]; // Reset on read error
             }

             // Add/Update the copytree-server configuration
             $mcpConfig['mcpServers']['copytree-server'] = $copytreeServerConfig;
             $actionMessage = 'Updated CopyTree MCP server configuration in: ';

        } else {
             // File doesn't exist, use the default structure directly
             $mcpConfig = ['mcpServers' => ['copytree-server' => $copytreeServerConfig]];
             $actionMessage = 'Created MCP configuration file with CopyTree server definition at: ';
        }


        // Step 5: Write the final configuration back to mcp.json
        try {
             $finalJson = json_encode($mcpConfig, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
             if ($finalJson === false) {
                  throw new \RuntimeException('Failed to encode final JSON configuration: ' . json_last_error_msg());
             }
             if (File::put($targetFile, $finalJson) === false) {
                  throw new \RuntimeException('Failed to write configuration to ' . $targetFile);
             }
             $this->info($actionMessage . $targetFile);
             return self::SUCCESS;

         } catch (\Exception $e) {
             $this->error('Error writing configuration file: ' . $e->getMessage());
             Log::error("Failed to write to {$targetFile}: " . $e->getMessage());
             return self::FAILURE;
         }
    }

    /**
     * Safely attempts to delete an old rule file and logs warnings.
     * @param string $filePath
     */
    private function deleteOldRuleFile(string $filePath): void
    {
         if (File::exists($filePath)) {
             try {
                 if (File::delete($filePath)) {
                     $this->info('Removed old rule file: ' . $filePath);
                 } else {
                     $this->warn('Could not remove old rule file: ' . $filePath);
                 }
             } catch (\Exception $e) {
                 $this->warn('Error removing old rule file ' . $filePath . ': ' . $e->getMessage());
             }
         }
    }
}
