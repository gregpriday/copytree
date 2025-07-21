#!/usr/bin/env node

// Suppress dotenv console output
const originalLog = console.log;
console.log = () => {};
require('dotenv').config();
console.log = originalLog;
const { Command } = require('commander');
const program = new Command();

program
  .name('copytree')
  .description('Copy directory structures and file contents into structured XML format')
  .version('1.0.0');

// 1. Main copy command (default)
program
  .command('copy [path]', { isDefault: true })
  .description('Copy directory structure to XML with customizable profiles and filters')
  .option('-p, --profile <name>', 'Use a predefined profile (default: auto-detect)')
  .option('-f, --filter <pattern...>', 'Additional filter patterns')
  .option('-a, --ai-filter <query>', 'Use AI to filter files based on natural language query')
  .option('-m, --modified', 'Only include git modified files')
  .option('-c, --changed <ref>', 'Only include files changed since git ref')
  .option('-o, --output <file>', 'Save output to file')
  .option('--format <format>', 'Output format: xml, json, tree (default: xml)')
  .option('-i, --display', 'Display output to console')
  .option('-S, --stream', 'Stream output')
  .option('--dry-run', 'Show what would be copied without doing it')
  .option('-l, --head <n>', 'Limit to first N files')
  .option('-C, --char-limit <n>', 'Character limit for output')
  .option('--include-binary', 'Include binary files')
  .option('--external <source...>', 'Include external sources')
  .option('--with-line-numbers', 'Add line numbers to file content')
  .option('--info', 'Show info table')
  .option('--show-size', 'Show file sizes')
  .option('--with-git-status', 'Include git status in output')
  .option('-r, --as-reference', 'Generate reference documentation')
  .option('--validate', 'Validate profile without executing')
  .option('--clipboard', 'Copy output to clipboard')
  .option('-s, --sort <by>', 'Sort files by: path, size, modified, name, extension')
  .option('--dedupe', 'Remove duplicate files')
  .option('--always <patterns...>', 'Always include these patterns')
  .action(async (path, options) => {
    const copyCommand = require('../src/commands/copy');
    await copyCommand(path || '.', options);
  });

// 2. Ask command
program
  .command('ask <query>')
  .description('Ask a question about the project codebase')
  .option('-s, --state [id]', 'Conversation state ID')
  .option('--provider <name>', 'AI provider to use')
  .option('--model <name>', 'Specific model to use')
  .option('--no-stream', 'Disable streaming responses')
  .action(async (query, options) => {
    const askCommand = require('../src/commands/ask');
    await askCommand(query, options);
  });

// 3. Watch command
program
  .command('watch [path]')
  .description('Watch directory for changes and regenerate output')
  .option('-o, --output <file>', 'Output file (auto-generated if not specified)')
  .option('-p, --profile <name>', 'Profile to use')
  .option('-w, --debounce <ms>', 'Debounce delay in milliseconds', '1000')
  .option('--no-cache', 'Disable caching for GitHub repositories')
  .option('--size-report', 'Show file size report on each update')
  .option('--no-reveal', 'Disable macOS Finder reveal')
  .option('--skip-initial', 'Skip initial copy on start')
  .option('-d, --depth <n>', 'Max directory depth to watch')
  .option('--poll-interval <ms>', 'File polling interval', '1000')
  .option('-v, --verbose', 'Show verbose output')
  .action(async (path, options) => {
    const watchCommand = require('../src/commands/watch');
    await watchCommand(path || '.', options);
  });

// 4. MCP command
program
  .command('mcp [directory]')
  .description('Start CopyTree MCP server for Claude integration')
  .option('--port <port>', 'Server port (default: stdio)')
  .option('--debug', 'Enable debug logging')
  .action(async (directory, options) => {
    const mcpCommand = require('../src/commands/mcp');
    await mcpCommand(directory, options);
  });

// 5. Profile create command
program
  .command('profile:create [path]')
  .description('Create new profile by scanning project and collecting goals')
  .option('-c, --char-limit <num>', 'Character limit for profile', '50000')
  .option('--name <name>', 'Profile name')
  .option('-o, --output <file>', 'Output file path')
  .action(async (path, options) => {
    const profileCreateCommand = require('../src/commands/profileCreate');
    await profileCreateCommand(path || '.', options);
  });

// 6. Profile list command
program
  .command('profile:list')
  .description('List all available profiles')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const profileListCommand = require('../src/commands/profileList');
    await profileListCommand(options);
  });

// 7. Profile validate command
program
  .command('profile:validate [profile]')
  .description('Validate profile syntax and structure')
  .option('--all', 'Validate all profiles')
  .action(async (profile, options) => {
    const profileValidateCommand = require('../src/commands/profileValidate');
    await profileValidateCommand(profile, options);
  });

// 8. Copy docs command
program
  .command('copy:docs')
  .description('Copy framework/library documentation')
  .option('--topic <name>', 'Documentation topic to copy')
  .option('-o, --output <file>', 'Output file instead of clipboard')
  .option('--no-clipboard', 'Display to console instead of clipboard')
  .action(async (options) => {
    const copyDocsCommand = require('../src/commands/copyDocs');
    await copyDocsCommand(options);
  });

// 9. Config validate command
program
  .command('config:validate')
  .description('Validate application configuration')
  .action(async () => {
    const configValidateCommand = require('../src/commands/configValidate');
    await configValidateCommand();
  });

// 10. Cache clear command
program
  .command('cache:clear')
  .description('Clear all caches')
  .option('--transformations', 'Clear only transformation cache')
  .option('--ai', 'Clear only AI cache')
  .option('--git', 'Clear only git cache')
  .option('--profiles', 'Clear only profile detection cache')
  .option('--gc', 'Run garbage collection on expired entries')
  .option('--status', 'Show cache status after clearing')
  .option('-v, --verbose', 'Show verbose output')
  .action(async (options) => {
    const cacheClearCommand = require('../src/commands/cacheClear');
    await cacheClearCommand(options);
  });

// 11. Install copytree command
program
  .command('install:copytree')
  .description('Set up CopyTree environment and configuration')
  .action(async () => {
    const installCopytreeCommand = require('../src/commands/installCopytree');
    await installCopytreeCommand();
  });

// 12. Install claude command
program
  .command('install:claude')
  .description('Install CopyTree MCP server configuration for Claude Code')
  .option('--update-claude-md', 'Also update CLAUDE.md file')
  .action(async (options) => {
    const installClaudeCommand = require('../src/commands/installClaude');
    await installClaudeCommand(options);
  });

program.parse(process.argv);