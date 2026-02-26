#!/usr/bin/env node

// Note: Removed ESM loader since we don't use JSX files directly

// Note: Removed @babel/register for better performance

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
import { Command, InvalidArgumentError } from 'commander';
import { readFileSync } from 'fs';
import { logger } from '../src/utils/logger.js';

/**
 * Apply logging options from parsed CLI options to the global logger singleton.
 * Must be called before any logger usage in command handlers.
 *
 * @param {Object} options - Parsed commander options
 */
function applyLoggingOptions(options) {
  const logOptions = {};
  if (options.logLevel !== undefined) logOptions.level = options.logLevel;
  if (options.logFormat !== undefined) logOptions.format = options.logFormat;
  if (options.color === false) logOptions.colorize = 'never';
  if (Object.keys(logOptions).length > 0) {
    logger.configure(logOptions);
  }
}

const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

const program = new Command();

program
  .name('copytree')
  .description(
    'Copy directory structures and file contents into XML (default), Markdown, JSON, NDJSON, SARIF, or tree formats',
  )
  .version(pkg.version);

// 1. Main copy command (default)
program
  .command('copy [path]', { isDefault: true })
  .description(
    'Copy directory structure to XML (default) or Markdown/JSON/NDJSON/SARIF/tree with customizable filters',
  )
  .option('-p, --profile <name>', 'Use folder profile by name (.copytree-<name>.*)')
  .option('-f, --filter <pattern...>', 'Additional filter patterns')
  .option('-m, --modified', 'Only include git modified files')
  .option('-c, --changed <ref>', 'Only include files changed since git ref')
  .option('-o, --output <file>', 'Save output to file')
  .option(
    '--format <format>',
    'Output format: xml, markdown|md, json, ndjson, sarif, tree (default: xml)',
  )
  .option('-i, --display', 'Display output to console')
  .option('-S, --stream', 'Stream output')
  .option('--dry-run', 'Show what would be copied without doing it')
  .option('-l, --head <n>', 'Limit to first N files')
  .option('-C, --char-limit <n>', 'Character limit for output')
  .option('--include-binary', 'Include binary files')
  .option('--with-line-numbers', 'Add line numbers to file content')
  .option('-t, --only-tree', 'Include only the directory tree, not file contents')
  .option('--info', 'Show info table')
  .option('--show-size', 'Show file sizes')
  .option('--with-git-status', 'Include git status in output')
  .option('-r, --as-reference', 'Generate reference and auto-load folder profile if present')
  .option('--clipboard', 'Copy output to clipboard')
  .option('-s, --sort <by>', 'Sort files by: path, size, modified, name, extension')
  .option('--dedupe', 'Remove duplicate files')
  .option('--always <patterns...>', 'Always include these patterns')
  .option('--no-tests', 'Exclude test files and directories (for compact AI context)')
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
  .option('--fail-on-fs-errors', 'Exit with error if filesystem operations fail after retries')
  .option(
    '--log-level <level>',
    'Set log verbosity: error, warn, info, debug (default: info)',
    (val) => {
      const valid = ['error', 'warn', 'info', 'debug'];
      if (!valid.includes(val)) {
        throw new InvalidArgumentError(`'${val}' is not valid. Choose from: ${valid.join(', ')}`);
      }
      return val;
    },
  )
  .option(
    '--log-format <format>',
    'Log output format: text, json, silent (default: text)',
    (val) => {
      const valid = ['text', 'json', 'silent'];
      if (!valid.includes(val)) {
        throw new InvalidArgumentError(`'${val}' is not valid. Choose from: ${valid.join(', ')}`);
      }
      return val;
    },
  )
  .option('--no-color', 'Disable ANSI color codes in log output')
  .action(async (targetPath, options) => {
    applyLoggingOptions(options);
    // Auto-detect format from output file extension
    if (!options.format && options.output) {
      const formatByExt = {
        '.json': 'json',
        '.md': 'markdown',
        '.markdown': 'markdown',
        '.ndjson': 'ndjson',
        '.sarif': 'sarif',
      };
      const inferred = formatByExt[path.extname(options.output).toLowerCase()];
      if (inferred) {
        options.format = inferred;
      }
    }

    // When streaming, skip UI and run command directly
    if (options.stream) {
      const copyCommand = (await import('../src/commands/copy.js')).default;
      try {
        await copyCommand(targetPath || '.', options);
        process.exit(0);
      } catch (error) {
        console.error(error.message);
        process.exit(1);
      }
      return;
    }

    if (!render || !App) {
      const ink = await import('ink');
      render = ink.render;
      const appModule = await import('../src/ui/App.js');
      App = appModule.default;
    }
    render(
      React.createElement(App, {
        command: 'copy',
        path: targetPath || '.',
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
  .option('--section <name>', 'Show only specific config section (app, cache, copytree)')
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
  .option('--git', 'Clear only git cache')
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

// 12. Install copytree command - REMOVED
// This command has been removed as all directories are auto-created on first use.

program.parse(process.argv);
