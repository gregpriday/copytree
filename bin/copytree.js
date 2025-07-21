#!/usr/bin/env node

require('dotenv').config();
const { Command } = require('commander');
const program = new Command();

program
  .name('copytree')
  .description('Copy directory structures and file contents into structured XML format')
  .version('1.0.0');

program
  .command('copy [path]', { isDefault: true })
  .description('Copy directory structure to XML')
  .option('--ai-filter <query>', 'Use AI to filter files based on query')
  .option('--modified', 'Only include git modified files')
  .option('--changed', 'Only include git changed files')
  .option('--filter <pattern>', 'Glob pattern to filter files')
  .option('--profile <name>', 'Use a predefined profile')
  .option('--display', 'Display output to console')
  .option('--output [filename]', 'Save output to file')
  .option('--stream', 'Stream output')
  .option('--dry-run', 'Show what would be copied without doing it')
  .action(async (path, options) => {
    const copyCommand = require('../src/commands/copy');
    await copyCommand(path || '.', options);
  });

program
  .command('profile:create [path]')
  .description('Create a profile from AI analysis')
  .option('--char-limit <num>', 'Character limit for profile', '50000')
  .action(async (path, options) => {
    const profileCreateCommand = require('../src/commands/profileCreate');
    await profileCreateCommand(path || '.', options);
  });

program
  .command('ask <query>')
  .description('Ask AI about the codebase')
  .option('--state [id]', 'Conversation state ID')
  .action(async (query, options) => {
    const askCommand = require('../src/commands/ask');
    await askCommand(query, options);
  });

program
  .command('install:claude')
  .description('Install Claude integration')
  .action(async () => {
    const installClaudeCommand = require('../src/commands/installClaude');
    await installClaudeCommand();
  });

program.parse(process.argv);