#!/usr/bin/env node

// Note: Removed ESM loader since we don't use JSX files directly

// Note: Removed @babel/register for better performance

import path from 'path';
import { Command, InvalidArgumentError, Option } from 'commander';
import { logger } from '../src/utils/logger.js';
import { VERSION } from '../src/version.js';

/**
 * Load the terminal UI on first use.
 *
 * Only the configuration commands render a persistent multi-line interface;
 * `copy` does not, and no longer loads React or Ink at all. One progress line
 * and one completion line never needed a component tree, a virtual DOM or a
 * reconciler — and routing them through one made the successful clipboard path
 * finish without printing anything, because the frame was never queued.
 *
 * @returns {Promise<{render: Function, App: Function, React: Object}>} UI entry points
 */
let uiPromise = null;
function loadUi() {
  if (!uiPromise) {
    uiPromise = Promise.all([import('react'), import('ink'), import('../src/ui/App.js')]).then(
      ([reactModule, ink, appModule]) => ({
        React: reactModule.default,
        render: ink.render,
        App: appModule.default,
      }),
    );
  }
  return uiPromise;
}

/**
 * Render a UI command, loading the UI layer on demand.
 * @param {string} command - Command name for the App component
 * @param {string|null} targetPath - Path argument, when the command takes one
 * @param {Object} options - Parsed commander options
 * @returns {Promise<void>}
 */
async function renderCommand(command, targetPath, options) {
  const { render, App, React } = await loadUi();
  render(React.createElement(App, { command, path: targetPath, options }));
}

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

const pkg = { version: VERSION };

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
  // The default destination is the one thing a new user cannot guess from the
  // flag list, because it is the behaviour you get by passing nothing.
  .addHelpText(
    'after',
    '\nBy default CopyTree writes a temporary file and copies its file reference,\n' +
      'so pasting into an agent hands over a file to read rather than inline context.\n' +
      'Use --clipboard for the text itself, --output to save, --display to print,\n' +
      'or --stream for large outputs and CI.\n',
  )
  .option('-p, --folder-profile <name>', 'Use folder profile by name (.copytree-<name>.*)')
  .option('--profile <type>', 'Enable performance profiling: cpu, heap, all')
  .option('--profile-dir <dir>', 'Profile output directory (default: .profiles)')
  .option('-f, --filter <pattern...>', 'Additional filter patterns')
  .option('-m, --modified', 'Only include git modified files')
  .option('-c, --changed <ref>', 'Only include files changed since git ref')
  .option('-o, --output <file>', 'Save output to file')
  .option('--reveal', 'After writing a file, show it in the OS file manager')
  .option(
    '--format <format>',
    'Output format: xml, markdown|md, json, ndjson, sarif, tree (default: xml)',
  )
  .option('-i, --display', 'Display output to console')
  .option('-v, --verbose', 'Show run detail: phases, selection summary, size and duration')
  .option('-q, --quiet', 'Suppress progress and completion output; errors still go to stderr')
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
  .option('-y, --clipboard', 'Copy the output text itself to the clipboard, not a file reference')
  .option('--no-folder-profile', 'Skip auto-discovery of a .copytree.yml folder profile')
  // Reference output is the default. Accepted so existing muscle memory and
  // scripts keep working; it selects the behaviour they would get anyway.
  // Hidden from help, where it would read as a choice rather than a leftover.
  .addOption(
    new Option(
      '-r, --as-reference',
      'Legacy no-op: writing a file reference is the default',
    ).hideHelp(),
  )
  .option('-s, --sort <by>', 'Sort files by: path, size, modified, name, extension, depth')
  .option('--sort-order <order>', 'Sort direction: asc (default) or desc', (val) => {
    if (!['asc', 'desc'].includes(val)) {
      throw new InvalidArgumentError(`'${val}' is not valid. Choose from: asc, desc`);
    }
    return val;
  })
  .option('--dedupe', 'Remove duplicate files')
  .option('--always <patterns...>', 'Always include these patterns')
  .option('--no-tests', 'Exclude test files and directories (for compact AI context)')
  .option('--no-cache', 'Disable caching for AI operations')
  .option('--no-instructions', 'Disable including instructions in output')
  .option('--instructions <name>', 'Use custom instructions set (default: default)')
  .option('--no-validate', 'Disable configuration validation')
  .option(
    '--ext <extensions>',
    'Filter by file extensions, comma-separated (e.g., .js,.ts,.tsx or js,ts)',
  )
  .option(
    '--max-depth <n>',
    'Maximum directory traversal depth (0 = root files only, 1 = one level deep, etc.)',
    (val) => {
      const n = parseInt(val, 10);
      if (isNaN(n) || n < 0) {
        throw new InvalidArgumentError(
          `'${val}' is not a valid depth. Must be a non-negative integer.`,
        );
      }
      return n;
    },
  )
  .option('-x, --exclude <pattern...>', 'Exclude patterns (glob)')
  .option(
    '--scope <path...>',
    'Copy only these paths (files or directories). Literal paths, not globs: ' +
      'ignore rules still resolve from the project root and output paths stay root-relative',
  )
  .option(
    '--scope-include-ignored',
    'Let --scope entries override the ignore rules that would exclude them',
  )
  .option(
    '--scope-include-config-excluded',
    'Let --scope entries override config exclusions (node_modules, globalExcluded*). ' +
      '.git is never included',
  )
  .option('--min-size <size>', 'Exclude files smaller than this size (e.g., 1KB, 500B, 10MB)')
  .option('--max-size <size>', 'Exclude files larger than this size (e.g., 10MB, 1GB)')
  .option(
    '--size-gate <size>',
    'Hard per-file size gate applied before opening anything (default: 256KB). ' +
      'Only --always and .copytreeinclude override it',
  )
  .option('--no-size-gate', 'Disable the per-file size gate')
  .option('--max-total-size <size>', 'Total size budget across all files (e.g., 5MB)')
  .option('--max-files <n>', 'Maximum number of files to include', (val) => {
    const n = parseInt(val, 10);
    if (isNaN(n) || n <= 0) {
      throw new InvalidArgumentError(
        `'${val}' is not a valid file count. Must be a positive integer.`,
      );
    }
    return n;
  })
  .option('--explain', 'Report which rule excluded each file (adds detail to --dry-run output)')
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

    // Every copy mode — default, streaming, profiling, dry run — goes through
    // one controller. There is no second path that could report differently.
    const copyCommand = (await import('../src/commands/copy.js')).default;
    await copyCommand(targetPath || '.', options);
  });

// 9. Config validate command
program
  .command('config:validate')
  .description('Validate application configuration')
  .option('--no-validate', 'Skip schema validation (for testing)')
  .action(async (options) => {
    await renderCommand('config:validate', null, options);
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
    await renderCommand('config:inspect', null, options);
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
    await renderCommand('cache:clear', null, options);
  });

// 12. Install copytree command - REMOVED
// This command has been removed as all directories are auto-created on first use.

/**
 * Ctrl+C is a decision, not a fault.
 *
 * Node's default SIGINT handling kills the process outright, which skips `exit`
 * listeners — so a run interrupted mid-spinner would leave the cursor hidden
 * and the live line half-drawn. Claiming the signal here lets the terminal be
 * put back the way it was found, and reports the outcome as what it is: a
 * cancellation, in the neutral status, with no stack trace.
 */
process.on('SIGINT', () => {
  if (process.stderr.isTTY) {
    process.stderr.write('\r\x1b[2K\x1b[?25h');
  }
  process.stderr.write(`${process.stderr.isTTY ? '○' : '-'} Cancelled\n`);
  // 130 is the conventional "terminated by SIGINT" status.
  process.exit(130);
});

program.parse(process.argv);
