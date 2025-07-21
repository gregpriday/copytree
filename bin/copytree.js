#!/usr/bin/env node

require('dotenv').config();
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
  .option('--profile <name>', 'Use a predefined profile (default: auto-detect)')
  .option('--filter <pattern...>', 'Additional filter patterns')
  .option('--ai-filter <query>', 'Use AI to filter files based on natural language query')
  .option('--modified', 'Only include git modified files')
  .option('--changed <ref>', 'Only include files changed since git ref')
  .option('--output <file>', 'Save output to file')
  .option('--format <format>', 'Output format: xml, json, tree (default: xml)')
  .option('--display', 'Display output to console')
  .option('--stream', 'Stream output')
  .option('--dry-run', 'Show what would be copied without doing it')
  .option('--head <n>', 'Limit to first N files')
  .option('--char-limit <n>', 'Character limit for output')
  .option('--include-binary', 'Include binary files')
  .option('--external <source...>', 'Include external sources')
  .option('--with-line-numbers', 'Add line numbers to file content')
  .option('--info', 'Show info table')
  .option('--show-size', 'Show file sizes')
  .option('--with-git-status', 'Include git status in output')
  .action(async (path, options) => {
    const copyCommand = require('../src/commands/copy');
    await copyCommand(path || '.', options);
  });

// 2. Ask command
program
  .command('ask <query>')
  .description('Ask a question about the project codebase')
  .option('--state [id]', 'Conversation state ID')
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
  .option('--output <file>', 'Output file (required)')
  .option('--profile <name>', 'Profile to use')
  .option('--debounce <ms>', 'Debounce delay in milliseconds', '1000')
  .action(async (path, options) => {
    const watchCommand = require('../src/commands/watch');
    await watchCommand(path || '.', options);
  });

// 4. MCP command
program
  .command('mcp')
  .description('Start CopyTree MCP server')
  .option('--port <port>', 'Server port', '3000')
  .action(async (options) => {
    const mcpCommand = require('../src/commands/mcp');
    await mcpCommand(options);
  });

// 5. Profile create command
program
  .command('profile:create [path]')
  .description('Create new profile by scanning project and collecting goals')
  .option('--char-limit <num>', 'Character limit for profile', '50000')
  .option('--name <name>', 'Profile name')
  .option('--output <file>', 'Output file path')
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
  .description('Copy profile documentation')
  .option('--output <file>', 'Output file (default: profile-docs.txt)')
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