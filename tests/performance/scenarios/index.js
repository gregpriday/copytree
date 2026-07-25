/**
 * Benchmark scenario definitions.
 *
 * Each scenario isolates one performance domain so a change can be attributed
 * rather than guessed at. A single end-to-end duration hides too much: a
 * discovery win cancelled out by formatting, a lower total that costs twice the
 * memory, or an "optimisation" that is really just doing less work. Every
 * scenario therefore returns a correctness fingerprint alongside its timing.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { fingerprintFiles, fingerprintOutput } from '../lib/runner.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');

/**
 * Root of the CopyTree checkout under measurement.
 *
 * Normally this is the repository the harness lives in. Setting
 * `COPYTREE_BENCH_SRC` points the scenarios at a different checkout, which is
 * what makes interleaved A/B possible: the same harness, the same fixtures, the
 * same process shape, two different revisions of `src/`.
 */
const SRC_ROOT = process.env.COPYTREE_BENCH_SRC
  ? path.resolve(process.env.COPYTREE_BENCH_SRC)
  : REPO_ROOT;

const CLI = path.join(SRC_ROOT, 'bin/copytree.js');

/**
 * Import a module from the checkout under measurement.
 * @param {string} relative - Repository-relative module path
 * @returns {Promise<any>} Module namespace
 */
function load(relative) {
  return import(pathToFileURL(path.join(SRC_ROOT, relative)).href);
}

/**
 * Build a hermetic ConfigManager.
 *
 * `userConfig: false` keeps `~/.copytree` out of the measurement: a developer
 * with a large personal config would otherwise measure a different product than
 * CI does. The two gitignore sources outside the tree are disabled for the same
 * reason.
 *
 * @returns {Promise<Object>} Configured instance
 */
async function hermeticConfig() {
  const { ConfigManager } = await load('src/config/ConfigManager.js');
  const config = await ConfigManager.create({ userConfig: false });
  config.set('copytree.gitignore.globalExcludesFile', false);
  config.set('copytree.gitignore.infoExclude', false);
  return config;
}

/**
 * Collect an async iterable into an array.
 * @param {AsyncIterable<any>} iterable - Source
 * @returns {Promise<any[]>} Collected values
 */
async function collect(iterable) {
  const out = [];
  for await (const value of iterable) out.push(value);
  return out;
}

/**
 * Run the CLI in a fresh process and resolve when it exits.
 * @param {string[]} args - CLI arguments
 * @returns {Promise<{code: number, bytes: number}>} Exit code and stdout size
 */
function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, NO_COLOR: '1', COPYTREE_NO_USER_CONFIG: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let bytes = 0;
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
    });
    child.stderr.on('data', () => {});
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, bytes }));
  });
}

/* ------------------------------------------------------------------ *
 * Startup and configuration
 * ------------------------------------------------------------------ */

const startup = [
  {
    id: 'START-01',
    domain: 'startup',
    title: 'Cold CLI, empty directory, tree output',
    fixture: 'empty',
    mode: 'cold-process',
    samples: 8,
    warmup: 2,
    memory: false,
    gc: false,
    async run({ fixture }) {
      const { code } = await runCli([fixture.path, '--format', 'tree', '--display']);
      return { exitCode: code };
    },
  },
  {
    id: 'START-04',
    domain: 'startup',
    title: 'ConfigManager.create() cold, no user config',
    mode: 'warm-process-cold-operation',
    samples: 15,
    async run() {
      const config = await hermeticConfig();
      return { keys: Object.keys(config.all()).length };
    },
  },
  {
    id: 'START-06',
    domain: 'startup',
    title: '10 small copies, new config each time',
    fixture: 'tiny-100',
    mode: 'warm-process-cold-operation',
    samples: 6,
    async run({ fixture }) {
      const { copy } = await load('src/api/copy.js');
      let files = 0;
      for (let i = 0; i < 10; i++) {
        const config = await hermeticConfig();
        const result = await copy(fixture.path, { config, format: 'xml' });
        files = result.stats.totalFiles;
      }
      return { selectedFiles: files };
    },
  },
  {
    id: 'START-07',
    domain: 'startup',
    title: '10 small copies, one reused config',
    fixture: 'tiny-100',
    mode: 'warm-process-reused-config',
    samples: 6,
    async setup() {
      return { config: await hermeticConfig() };
    },
    async run({ fixture, config }) {
      const { copy } = await load('src/api/copy.js');
      let files = 0;
      for (let i = 0; i < 10; i++) {
        const result = await copy(fixture.path, { config, format: 'xml' });
        files = result.stats.totalFiles;
      }
      return { selectedFiles: files };
    },
  },
];

/* ------------------------------------------------------------------ *
 * Discovery
 * ------------------------------------------------------------------ */

/**
 * A discovery scenario: scan with no content, so the number is traversal and
 * ignore evaluation only.
 *
 * @param {Object} spec - Scenario fields
 * @returns {Object} Scenario definition
 */
function discovery(spec) {
  return {
    domain: 'discovery',
    samples: spec.samples ?? 8,
    async setup() {
      return { config: await hermeticConfig() };
    },
    async run({ fixture, config, mark }) {
      const { scan } = await load('src/api/scan.js');
      const files = [];
      for await (const file of scan(fixture.path, {
        config,
        includeContent: false,
        ...(spec.scanOptions?.(fixture) ?? {}),
      })) {
        if (files.length === 0) mark('firstFileMs');
        files.push(file);
      }
      return fingerprintFiles(files);
    },
    ...spec,
  };
}

const discoveryScenarios = [
  discovery({
    id: 'DISC-01',
    title: 'Sequential discovery, balanced 10k',
    fixture: 'balanced-10k',
  }),
  discovery({
    id: 'DISC-02',
    title: 'Sequential discovery, one flat 10k directory',
    fixture: 'flat-10k',
  }),
  discovery({
    id: 'DISC-03',
    title: 'Discovery with a .gitignore at every level, deep 10k',
    fixture: 'deep-10k',
  }),
  discovery({
    id: 'DISC-04',
    title: 'Discovery over 50k files with 90% pruned',
    fixture: 'pruned-50k',
    samples: 6,
  }),
  discovery({
    id: 'DISC-07',
    title: 'Full traversal of the 50k scope fixture',
    fixture: 'scope-50k',
    samples: 6,
  }),
  discovery({
    id: 'DISC-08',
    title: 'Scoped discovery: 100 files inside 50k',
    fixture: 'scope-50k',
    samples: 10,
    scanOptions: (fixture) => ({ scope: [fixture.scopeSubtree ?? 'src/target'] }),
  }),
  discovery({
    id: 'DISC-06',
    title: 'Discovery with explain enabled, pruned 50k',
    fixture: 'pruned-50k',
    samples: 6,
    scanOptions: () => ({ explain: true }),
  }),
];

/* ------------------------------------------------------------------ *
 * Selection: sorting and budgets
 * ------------------------------------------------------------------ */

/**
 * Build in-memory file objects so selection is measured without disk I/O.
 * @param {number} count - How many
 * @returns {Object[]} Synthetic file entries
 */
function syntheticFiles(count) {
  const files = [];
  const dirs = ['src/core', 'src/utils', 'lib/models', 'app/views', 'packages/api'];
  for (let i = 0; i < count; i++) {
    const dir = dirs[i % dirs.length];
    files.push({
      path: `${dir}/module-${i}/file-${i % 97}-${i}.js`,
      absolutePath: `/tmp/${dir}/file-${i}.js`,
      size: 500 + ((i * 37) % 4000),
      modified: new Date(1700000000000 + i * 1000),
      stats: { size: 500 + ((i * 37) % 4000), mtime: new Date(1700000000000 + i * 1000) },
    });
  }
  return files;
}

const selection = [
  {
    id: 'SELECT-01',
    domain: 'selection',
    title: 'Sort 50k paths (default path order)',
    samples: 12,
    async setup() {
      return { files: syntheticFiles(50000) };
    },
    async run({ files }) {
      const { default: SortFilesStage } = await load('src/pipeline/stages/SortFilesStage.js');
      const stage = new SortFilesStage({ sortBy: 'path', order: 'asc' });
      const result = await stage.process({ basePath: '/tmp', files, stats: {} });
      return fingerprintFiles(result.files);
    },
  },
  {
    id: 'SELECT-02',
    domain: 'selection',
    title: 'Sort 50k entries by modified time',
    samples: 12,
    async setup() {
      return { files: syntheticFiles(50000) };
    },
    async run({ files }) {
      const { default: SortFilesStage } = await load('src/pipeline/stages/SortFilesStage.js');
      const stage = new SortFilesStage({ sortBy: 'modified', order: 'desc' });
      const result = await stage.process({ basePath: '/tmp', files, stats: {} });
      return fingerprintFiles(result.files);
    },
  },
];

/* ------------------------------------------------------------------ *
 * Content loading
 * ------------------------------------------------------------------ */

const loading = [
  {
    id: 'LOAD-01',
    domain: 'loading',
    title: 'Load content for 10k text files',
    fixture: 'balanced-10k',
    samples: 6,
    async setup({ fixture }) {
      const config = await hermeticConfig();
      const { scan } = await load('src/api/scan.js');
      const discovered = await collect(scan(fixture.path, { config, includeContent: false }));
      return { config, discovered };
    },
    async run({ config, discovered }) {
      const { default: FileLoadingStage } = await load('src/pipeline/stages/FileLoadingStage.js');
      const stage = new FileLoadingStage({ encoding: 'utf8', config });
      const result = await stage.process({ basePath: '/tmp', files: discovered, stats: {} });
      const loaded = result.files.filter(Boolean);
      return {
        ...fingerprintFiles(loaded),
        contentChars: loaded.reduce((sum, f) => sum + (f.content?.length ?? 0), 0),
      };
    },
  },
  {
    id: 'LOAD-03',
    domain: 'loading',
    title: 'Load 50 MB across 500 larger text files',
    fixture: 'text-50mb',
    samples: 6,
    async setup({ fixture }) {
      const config = await hermeticConfig();
      const { scan } = await load('src/api/scan.js');
      const discovered = await collect(scan(fixture.path, { config, includeContent: false }));
      return { config, discovered };
    },
    async run({ config, discovered }) {
      const { default: FileLoadingStage } = await load('src/pipeline/stages/FileLoadingStage.js');
      const stage = new FileLoadingStage({ encoding: 'utf8', config });
      const result = await stage.process({ basePath: '/tmp', files: discovered, stats: {} });
      const loaded = result.files.filter(Boolean);
      return {
        ...fingerprintFiles(loaded),
        contentChars: loaded.reduce((sum, f) => sum + (f.content?.length ?? 0), 0),
      };
    },
  },
];

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

/**
 * A formatter scenario. Files are loaded once during setup so the measured
 * region contains no disk I/O: a formatter that looks fast because discovery
 * was slow is not a useful measurement.
 *
 * @param {Object} spec - Scenario fields
 * @returns {Object} Scenario definition
 */
function formatting(spec) {
  return {
    domain: 'formatting',
    samples: spec.samples ?? 8,
    async setup({ fixture }) {
      const config = await hermeticConfig();
      const { scan } = await load('src/api/scan.js');
      const files = await collect(scan(fixture.path, { config }));
      return { config, files };
    },
    async run({ files, config, fixture }) {
      const { format } = await load('src/api/format.js');
      const output = await format(files, {
        format: spec.format,
        basePath: fixture.path,
        config,
        ...(spec.formatOptions ?? {}),
      });
      return fingerprintOutput(output);
    },
    ...spec,
  };
}

const formatters = [
  formatting({
    id: 'FMT-01',
    title: 'XML format, 10k loaded files',
    fixture: 'balanced-10k',
    format: 'xml',
    samples: 6,
  }),
  formatting({
    id: 'FMT-02',
    title: 'Markdown format, 10k loaded files',
    fixture: 'balanced-10k',
    format: 'markdown',
    samples: 6,
  }),
  formatting({
    id: 'FMT-03',
    title: 'JSON format, 10k loaded files',
    fixture: 'balanced-10k',
    format: 'json',
    samples: 6,
  }),
  formatting({
    id: 'FMT-05',
    title: 'Tree format, 10k files',
    fixture: 'balanced-10k',
    format: 'tree',
    samples: 8,
  }),
  formatting({
    id: 'FMT-07',
    title: 'XML format with line numbers, 10k files',
    fixture: 'balanced-10k',
    format: 'xml',
    formatOptions: { addLineNumbers: true },
    samples: 6,
  }),
  formatting({
    id: 'FMT-08',
    title: 'XML format over 50 MB in 500 files',
    fixture: 'text-50mb',
    format: 'xml',
    samples: 6,
  }),
];

/* ------------------------------------------------------------------ *
 * Streaming and end-to-end
 * ------------------------------------------------------------------ */

const streaming = [
  {
    id: 'STRM-02',
    domain: 'streaming',
    title: 'copyStream over 10k files: first byte and total',
    fixture: 'balanced-10k',
    samples: 6,
    async setup() {
      return { config: await hermeticConfig() };
    },
    async run({ fixture, config, mark }) {
      const { copyStream } = await load('src/api/copyStream.js');
      let chars = 0;
      let first = true;
      for await (const chunk of copyStream(fixture.path, { config, format: 'xml' })) {
        if (first) {
          mark('firstByteMs');
          first = false;
        }
        chars += chunk.length;
      }
      return { outputChars: chars };
    },
  },
  {
    id: 'STRM-03',
    domain: 'streaming',
    title: 'copyStream over 50 MB: first byte and peak memory',
    fixture: 'text-50mb',
    samples: 6,
    async setup() {
      return { config: await hermeticConfig() };
    },
    async run({ fixture, config, mark }) {
      const { copyStream } = await load('src/api/copyStream.js');
      let chars = 0;
      let first = true;
      for await (const chunk of copyStream(fixture.path, { config, format: 'xml' })) {
        if (first) {
          mark('firstByteMs');
          first = false;
        }
        chars += chunk.length;
      }
      return { outputChars: chars };
    },
  },
];

const endToEnd = [
  {
    id: 'E2E-01',
    domain: 'end-to-end',
    title: 'Dry run over balanced 10k',
    fixture: 'balanced-10k',
    samples: 8,
    async setup() {
      return { config: await hermeticConfig() };
    },
    async run({ fixture, config }) {
      const { copy } = await load('src/api/copy.js');
      const result = await copy(fixture.path, { config, dryRun: true });
      return fingerprintFiles(result.manifest);
    },
  },
  {
    id: 'E2E-02',
    domain: 'end-to-end',
    title: 'Full XML copy over balanced 10k',
    fixture: 'balanced-10k',
    samples: 6,
    async setup() {
      return { config: await hermeticConfig() };
    },
    async run({ fixture, config }) {
      const { copy } = await load('src/api/copy.js');
      const result = await copy(fixture.path, { config, format: 'xml' });
      return {
        ...fingerprintOutput(result.output),
        selectedFiles: result.stats.totalFiles,
      };
    },
  },
  {
    id: 'E2E-03',
    domain: 'end-to-end',
    title: 'Full Markdown copy over 50 MB',
    fixture: 'text-50mb',
    samples: 6,
    async setup() {
      return { config: await hermeticConfig() };
    },
    async run({ fixture, config }) {
      const { copy } = await load('src/api/copy.js');
      const result = await copy(fixture.path, { config, format: 'markdown' });
      return {
        ...fingerprintOutput(result.output),
        selectedFiles: result.stats.totalFiles,
      };
    },
  },
  {
    id: 'E2E-07',
    domain: 'end-to-end',
    title: 'Scoped copy of 100 files inside 50k',
    fixture: 'scope-50k',
    samples: 8,
    async setup() {
      return { config: await hermeticConfig() };
    },
    async run({ fixture, config }) {
      const { copy } = await load('src/api/copy.js');
      const result = await copy(fixture.path, {
        config,
        format: 'xml',
        scope: [fixture.scopeSubtree ?? 'src/target'],
      });
      return {
        ...fingerprintOutput(result.output),
        selectedFiles: result.stats.totalFiles,
      };
    },
  },
];

export const SCENARIOS = [
  ...startup,
  ...discoveryScenarios,
  ...selection,
  ...loading,
  ...formatters,
  ...streaming,
  ...endToEnd,
];

/** Scenario ids that make up the pull-request scorecard. */
export const SCORECARD = [
  'START-01',
  'START-06',
  'START-07',
  'DISC-01',
  'DISC-03',
  'DISC-08',
  'SELECT-01',
  'LOAD-01',
  'FMT-02',
  'STRM-03',
  'E2E-02',
];

export default SCENARIOS;
