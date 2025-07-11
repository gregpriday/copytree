<?php

namespace App\Commands;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use LaravelZero\Framework\Commands\Command;

class InstallClaudeCommand extends Command
{
    /**
     * The signature of the command.
     *
     * @var string
     */
    protected $signature = 'install:claude 
                            {--append : Append to existing CLAUDE.md file instead of skipping}';

    /**
     * The description of the command.
     *
     * @var string
     */
    protected $description = 'Installs CopyTree MCP server configuration for Claude Code in the project root\'s mcp.json file and optionally updates CLAUDE.md.';

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

        $targetMcpFile = $cwd.DIRECTORY_SEPARATOR.'mcp.json';
        $claudeMdFile = $cwd.DIRECTORY_SEPARATOR.'CLAUDE.md';

        // Step 1: Handle mcp.json installation
        $mcpResult = $this->installMcpConfiguration($cwd, $targetMcpFile);
        if ($mcpResult !== self::SUCCESS) {
            return $mcpResult;
        }

        // Step 2: Handle CLAUDE.md
        $this->handleClaudeMd($claudeMdFile);

        $this->newLine();
        $this->info('✅ CopyTree MCP server successfully installed for Claude Code!');
        $this->newLine();
        $this->comment('To use with Claude Code:');
        $this->comment('1. Open this project folder in Claude Code');
        $this->comment('2. The MCP server will be automatically detected and loaded');
        $this->comment('3. Use the project_ask tool to query your codebase');

        return self::SUCCESS;
    }

    /**
     * Install or update the MCP configuration file.
     */
    private function installMcpConfiguration(string $cwd, string $targetFile): int
    {
        // Load the default configuration from resources/mcp.json
        $sourceFile = base_path('resources/mcp.json');
        if (! File::exists($sourceFile)) {
            $this->error('Source configuration file does not exist: '.$sourceFile);
            $this->error('Please ensure resources/mcp.json is created with the default server definition.');

            return self::FAILURE;
        }

        try {
            $defaultJsonContent = File::get($sourceFile);
            $defaultConfig = json_decode($defaultJsonContent, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                $this->error('Failed to decode default configuration from '.$sourceFile.': '.json_last_error_msg());

                return self::FAILURE;
            }

            // Ensure the default config has the expected structure
            if (! isset($defaultConfig['mcpServers']['copytree'])) {
                $this->error('Default configuration in '.$sourceFile.' is missing the mcpServers.copytree key.');

                return self::FAILURE;
            }

            $copytreeServerConfig = $defaultConfig['mcpServers']['copytree'];

            // Claude Code uses {project_root} as the working directory placeholder
            // No need to modify the config as it already has the correct structure

        } catch (\Exception $e) {
            $this->error('Error reading default configuration file '.$sourceFile.': '.$e->getMessage());

            return self::FAILURE;
        }

        // Handle existing or new mcp.json
        $mcpConfig = [];
        $actionMessage = '';

        if (File::exists($targetFile)) {
            $this->comment('Existing mcp.json found in project root.');

            try {
                $existingJsonContent = File::get($targetFile);
                $mcpConfig = json_decode($existingJsonContent, true);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    $this->warn('Could not decode existing mcp.json. It might be corrupted. Will overwrite with default CopyTree config. Error: '.json_last_error_msg());
                    $mcpConfig = ['mcpServers' => []];
                }

                // Ensure mcpServers key exists and is an array/object
                if (! isset($mcpConfig['mcpServers']) || ! is_array($mcpConfig['mcpServers'])) {
                    $this->warn('Existing mcp.json does not have a valid "mcpServers" object. Adding CopyTree server config.');
                    $mcpConfig['mcpServers'] = [];
                }

                // Check if copytree already exists
                if (isset($mcpConfig['mcpServers']['copytree'])) {
                    $this->comment('CopyTree server already configured. Updating configuration...');
                } else {
                    $this->comment('Adding CopyTree server to existing MCP configuration...');
                }

            } catch (\Exception $e) {
                $this->warn('Error reading existing mcp.json: '.$e->getMessage().'. Will overwrite with default CopyTree config.');
                $mcpConfig = ['mcpServers' => []];
            }

            // Add/Update the copytree configuration
            $mcpConfig['mcpServers']['copytree'] = $copytreeServerConfig;
            $actionMessage = 'Updated MCP configuration with CopyTree server in: ';

        } else {
            // File doesn't exist, use the default structure directly
            $mcpConfig = ['mcpServers' => ['copytree' => $copytreeServerConfig]];
            $actionMessage = 'Created MCP configuration file with CopyTree server at: ';
        }

        // Write the final configuration back to mcp.json
        try {
            $finalJson = json_encode($mcpConfig, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
            if ($finalJson === false) {
                throw new \RuntimeException('Failed to encode final JSON configuration: '.json_last_error_msg());
            }
            if (File::put($targetFile, $finalJson) === false) {
                throw new \RuntimeException('Failed to write configuration to '.$targetFile);
            }
            $this->info($actionMessage.$targetFile);

            return self::SUCCESS;

        } catch (\Exception $e) {
            $this->error('Error writing configuration file: '.$e->getMessage());
            Log::error("Failed to write to {$targetFile}: ".$e->getMessage());

            return self::FAILURE;
        }
    }

    /**
     * Handle CLAUDE.md file updates.
     */
    private function handleClaudeMd(string $claudeMdFile): void
    {
        if (File::exists($claudeMdFile)) {
            $this->comment('Found existing CLAUDE.md file.');

            // Check if CopyTree instructions already exist
            $existingContent = File::get($claudeMdFile);

            // Look for CopyTree-related content
            if (str_contains($existingContent, 'CopyTree') || str_contains($existingContent, 'copytree') || str_contains($existingContent, 'project_ask')) {
                $this->comment('CLAUDE.md already appears to contain CopyTree instructions. Skipping update.');

                return;
            }

            // Ask user if they want to append
            if ($this->option('append') || $this->confirm('Would you like to append CopyTree usage instructions to CLAUDE.md?', true)) {
                $this->appendToClaudeMd($claudeMdFile, $existingContent);
            } else {
                $this->comment('Skipped updating CLAUDE.md.');
            }
        } else {
            $this->newLine();
            $this->warn('No CLAUDE.md file found in project root.');
            $this->comment('Consider creating a CLAUDE.md file for project-specific instructions using:');
            $this->comment('  echo "# Project Instructions" > CLAUDE.md');
            $this->comment('');
            $this->comment('Then run this command again to add CopyTree instructions.');
        }
    }

    /**
     * Append content to CLAUDE.md file.
     */
    private function appendToClaudeMd(string $claudeMdFile, string $existingContent): void
    {
        try {
            // Load the content from resources
            $appendContentPath = base_path('resources/claude-md-append.md');
            if (! File::exists($appendContentPath)) {
                $this->warn('Could not find claude-md-append.md resource file. Using default content.');
                $appendContent = $this->getDefaultClaudeMdContent();
            } else {
                $appendContent = File::get($appendContentPath);
            }

            // Trim existing content and ensure proper spacing
            $trimmedContent = rtrim($existingContent);
            $finalContent = $trimmedContent."\n\n".$appendContent;

            // Write the updated content
            File::put($claudeMdFile, $finalContent);
            $this->info('✅ Successfully appended CopyTree instructions to CLAUDE.md');

        } catch (\Exception $e) {
            $this->warn('Could not append to CLAUDE.md: '.$e->getMessage());
        }
    }

    /**
     * Get the default content to append to CLAUDE.md.
     */
    private function getDefaultClaudeMdContent(): string
    {
        return <<<'EOD'
## CopyTree MCP Server

This project has CopyTree's `project_ask` tool for querying the codebase.

Examples:
- "What is the main purpose of this project?"
- "How does the authentication system work?"
- "Where is X implemented?"
- "Why is this test failing?"

Features: Stateful conversations (`state` parameter) and streaming (`stream: true`).
EOD;
    }
}
