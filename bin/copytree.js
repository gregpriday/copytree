#!/usr/bin/env node

// Note: Removed ESM loader since we don't use JSX files directly

// Note: Removed @babel/register for better performance

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from current working directory (user's project)
// Allow override via COPYTREE_ENV_PATH environment variable
const envPath = process.env.COPYTREE_ENV_PATH || path.join(process.cwd(), '.env');
// Suppress dotenv output by temporarily redirecting stdout (dotenv 17.x outputs to stdout)
const originalStdoutWrite = process.stdout.write;
process.stdout.write = () => {};
dotenv.config({ path: envPath });
process.stdout.write = originalStdoutWrite;

import React from 'react';
// Use dynamic import for ESM-only ink
let render;
let App;
(async () => {
  const ink = await import('ink');
  render = ink.render;
  const appModule = await import('../src/ui/App.js');
  App = appModule.default;
})().catch((_e) => {
  // Defer error until first render attempt
  render = undefined;
  App = undefined;
});
import { Command } from 'commander';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

const program = new Command();

program
  .name('copytree')
  .description(
    'Copy directory structures and file contents into XML (default), Markdown, JSON, or tree formats',
  )
  .version(pkg.version);

// 1. Main copy command (default)
program
  .command('copy [path]', { isDefault: true })
  .description(
    'Copy directory structure to XML (default) or Markdown/JSON/tree with customizable profiles and filters',
  )
  .option('-p, --profile <name>', 'Use a predefined profile (default: default)')
  .option('-f, --filter <pattern...>', 'Additional filter patterns')
  .option('-m, --modified', 'Only include git modified files')
  .option('-c, --changed <ref>', 'Only include files changed since git ref')
  .option('-o, --output <file>', 'Save output to file')
  .option('--format <format>', 'Output format: xml, markdown|md, json, tree (default: xml)')
  .option('-i, --display', 'Display output to console')
  .option('-S, --stream', 'Stream output')
  .option('--dry-run', 'Show what would be copied without doing it')
  .option('-l, --head <n>', 'Limit to first N files')
  .option('-C, --char-limit <n>', 'Character limit for output')
  .option('--include-binary', 'Include binary files')
  .option('--external <source...>', 'Include external sources')
  .option('--with-line-numbers', 'Add line numbers to file content')
  .option('-t, --only-tree', 'Include only the directory tree, not file contents')
  .option('--info', 'Show info table')
  .option('--show-size', 'Show file sizes')
  .option('--with-git-status', 'Include git status in output')
  .option('-r, --as-reference', 'Generate reference documentation')
  .option('--validate', 'Validate profile without executing')
  .option('--clipboard', 'Copy output to clipboard')
  .option('-s, --sort <by>', 'Sort files by: path, size, modified, name, extension')
  .option('--dedupe', 'Remove duplicate files')
  .option('--always <patterns...>', 'Always include these patterns')
  .option('--no-cache', 'Disable caching for AI operations')
  .option('--no-instructions', 'Disable including instructions in output')
  .option('--instructions <name>', 'Use custom instructions set (default: default)')
  .option('--no-validate', 'Disable configuration validation')
  .option('--secrets-guard', 'Enable automatic secret detection and redaction (default: enabled)')
  .option('--no-secrets-guard', 'Disable secret detection and redaction')
  .option(
    '--secrets-redact-mode <mode>',
    'Redaction marker style: typed, generic, hash (default: typed)',
  )
  .option('--fail-on-secrets', 'Exit with error if secrets are found (CI mode)')
  .option('--secrets-report <file>', 'Output secrets report to file (use - for stdout)')
  .action(async (path, options) => {
    if (!render || !App) {
      const ink = await import('ink');
      render = ink.render;
      const appModule = await import('../src/ui/App.js');
      App = appModule.default;
    }
    render(
      React.createElement(App, {
        command: 'copy',
        path: path || '.',
        options,
      }),
    );
  });

// 2. Profile list command
program
  .command('profile:list')
  .description('List all available profiles')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    if (!render || !App) {
      const ink = await import('ink');
      render = ink.render;
      const appModule = await import('../src/ui/App.js');
      App = appModule.default;
    }
    render(
      React.createElement(App, {
        command: 'profile:list',
        path: null,
        options,
      }),
    );
  });

// 7. Profile validate command
program
  .command('profile:validate [profile]')
  .description('Validate profile syntax and structure')
  .option('--all', 'Validate all profiles')
  .action(async (profile, options) => {
    if (!render || !App) {
      const ink = await import('ink');
      render = ink.render;
      const appModule = await import('../src/ui/App.js');
      App = appModule.default;
    }
    render(
      React.createElement(App, {
        command: 'profile:validate',
        path: null,
        options: { ...options, profile },
      }),
    );
  });

// 8. Copy docs command
program
  .command('copy:docs')
  .description('Copy CopyTree documentation (use --display to read all docs)')
  .option('--topic <name>', 'Legacy: documentation topic to copy')
  .option('--section <id...>', 'Copy specific section(s) by ID')
  .option('--group <id...>', 'Copy documentation group(s) by ID')
  .option('--task <id>', 'Copy task bundle with intro and checklist')
  .option('--list [kind]', 'List available items: all|sections|groups|tasks (default: all)')
  .option('--meta <format>', 'Output metadata in json or yaml format')
  .option('-o, --output <file>', 'Output file instead of clipboard')
  .option('-i, --display', 'Display to console (recommended for AI agents)')
  .option('--no-clipboard', 'Display to console instead of clipboard')
  .action(async (options) => {
    if (!render || !App) {
      const ink = await import('ink');
      render = ink.render;
      const appModule = await import('../src/ui/App.js');
      App = appModule.default;
    }
    render(
      React.createElement(App, {
        command: 'copy:docs',
        path: null,
        options,
      }),
    );
  });

// 9. Config validate command
program
  .command('config:validate')
  .description('Validate application configuration')
  .option('--no-validate', 'Skip schema validation (for testing)')
  .action(async (options) => {
    if (!render || !App) {
      const ink = await import('ink');
      render = ink.render;
      const appModule = await import('../src/ui/App.js');
      App = appModule.default;
    }
    render(
      React.createElement(App, {
        command: 'config:validate',
        path: null,
        options,
      }),
    );
  });

// 10. Config inspect command
program
  .command('config:inspect')
  .description('Inspect effective configuration with provenance')
  .option('--section <name>', 'Show only specific config section (ai, app, cache, copytree, state)')
  .option('--redact', 'Redact sensitive values (default: true)')
  .option('--no-redact', 'Show all values including sensitive ones')
  .option('--format <type>', 'Output format: table, json (default: table)', 'table')
  .action(async (options) => {
    if (!render || !App) {
      const ink = await import('ink');
      render = ink.render;
      const appModule = await import('../src/ui/App.js');
      App = appModule.default;
    }
    render(
      React.createElement(App, {
        command: 'config:inspect',
        path: null,
        options,
      }),
    );
  });

// 11. Cache clear command
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
    if (!render || !App) {
      const ink = await import('ink');
      render = ink.render;
      const appModule = await import('../src/ui/App.js');
      App = appModule.default;
    }
    render(
      React.createElement(App, {
        command: 'cache:clear',
        path: null,
        options,
      }),
    );
  });

// 12. Install copytree command
program
  .command('install:copytree')
  .description('Set up CopyTree environment and configuration')
  .action(async () => {
    if (!render || !App) {
      const ink = await import('ink');
      render = ink.render;
      const appModule = await import('../src/ui/App.js');
      App = appModule.default;
    }
    render(
      React.createElement(App, {
        command: 'install:copytree',
        path: null,
        options: {},
      }),
    );
  });

program.parse(process.argv);
