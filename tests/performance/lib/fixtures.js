/**
 * Deterministic benchmark fixtures.
 *
 * Every fixture is a pure function of its spec and seed, so a baseline run and a
 * candidate run measure byte-identical trees. Fixtures are cached on disk and
 * keyed by a hash of their spec: changing a spec regenerates it, re-running the
 * same spec reuses it. Generation always happens outside the timed region.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { SeededRandom } from './random.js';

const FIXTURE_ROOT = process.env.COPYTREE_BENCH_FIXTURES
  ? path.resolve(process.env.COPYTREE_BENCH_FIXTURES)
  : path.join(os.tmpdir(), 'copytree-bench-fixtures');

/** Files written per batch. Bounded so generation never exhausts descriptors. */
const WRITE_BATCH = 256;

/**
 * Fixture specifications.
 *
 * `files` is the target file count, `topology` decides the directory shape, and
 * `ignore` decides how ignore files are placed. Each entry documents the axis of
 * the performance model it exercises.
 */
export const FIXTURE_SPECS = {
  /** Pure startup and configuration cost, with no traversal to hide behind. */
  empty: { seed: 1001, files: 0, topology: 'flat', ignore: 'none' },

  /** The common interactive case: small selection, latency-dominated. */
  'tiny-100': { seed: 1002, files: 100, topology: 'balanced', fileBytes: 1024, ignore: 'root' },

  /** One very wide directory: readdir and entry sorting dominate. */
  'flat-10k': { seed: 1003, files: 10000, topology: 'flat', fileBytes: 1024, ignore: 'root' },

  /** The general discovery baseline: realistic width and depth. */
  'balanced-10k': {
    seed: 1004,
    files: 10000,
    topology: 'balanced',
    fileBytes: 1024,
    ignore: 'root',
  },

  /** Deep nesting with an ignore file at every level: layer-stack scaling. */
  'deep-10k': {
    seed: 1005,
    files: 10000,
    topology: 'deep',
    depth: 20,
    fileBytes: 1024,
    ignore: 'nested',
  },

  /** Most of the tree sits under ignored directories: measures pruning. */
  'pruned-50k': {
    seed: 1006,
    files: 50000,
    topology: 'balanced',
    fileBytes: 256,
    ignore: 'pruning',
    prunedFraction: 0.9,
  },

  /** A small subtree inside a large repository: the embedded file-browser case. */
  'scope-50k': {
    seed: 1007,
    files: 50000,
    topology: 'balanced',
    fileBytes: 256,
    ignore: 'root',
    scopeSubtree: 'src/target',
    scopeFiles: 100,
  },

  /** Bytes rather than entries: loading and formatting throughput. */
  'text-50mb': {
    seed: 1008,
    files: 500,
    topology: 'balanced',
    fileBytes: 100 * 1024,
    ignore: 'root',
  },
};

/**
 * Stable hash of a spec, used as the on-disk cache key.
 * @param {string} name - Fixture name
 * @param {Object} spec - Fixture spec
 * @returns {string} Short hex digest
 */
function specHash(name, spec) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ name, spec, version: 2 }))
    .digest('hex')
    .slice(0, 12);
}

/**
 * Build one file's content at a target size.
 *
 * Content is realistic source-shaped text rather than a single repeated
 * character: line-oriented work (line numbering, character budgets, markdown
 * fencing) behaves differently on one 100 KB line than on 2,000 short ones.
 *
 * @param {SeededRandom} rng - Seeded generator
 * @param {number} index - File index
 * @param {number} targetBytes - Approximate size
 * @returns {string} File content
 */
function buildContent(rng, index, targetBytes) {
  const lines = [`// file ${index}`, `export const ID_${index} = ${index};`];
  let size = lines.join('\n').length;

  while (size < targetBytes) {
    const line = `const ${rng.token(8)} = '${rng.token(48)}'; // ${rng.token(16)}`;
    lines.push(line);
    size += line.length + 1;
  }

  lines.push(`export default ID_${index};`);
  return lines.join('\n');
}

/**
 * Produce the list of relative directories for a topology.
 * @param {SeededRandom} rng - Seeded generator
 * @param {Object} spec - Fixture spec
 * @returns {string[]} POSIX-relative directory paths
 */
function buildDirectories(rng, spec) {
  const { topology, files } = spec;

  if (files === 0) return [];
  if (topology === 'flat') return ['files'];

  if (topology === 'deep') {
    const depth = spec.depth ?? 20;
    const dirs = [];
    let current = 'src';
    dirs.push(current);
    for (let level = 1; level < depth; level++) {
      current = `${current}/level-${level}`;
      dirs.push(current);
    }
    return dirs;
  }

  // Balanced: a realistic repository shape, several roots and a few levels.
  const roots = ['src', 'lib', 'app', 'packages', 'internal'];
  const dirs = [];
  const targetDirs = Math.max(1, Math.ceil(files / 25));

  for (const root of roots) {
    dirs.push(root);
  }
  let i = 0;
  while (dirs.length < targetDirs) {
    const parent = dirs[i % dirs.length];
    const depth = parent.split('/').length;
    if (depth < 5) {
      dirs.push(`${parent}/${rng.pick(['core', 'utils', 'models', 'views', 'api'])}-${dirs.length}`);
    }
    i++;
    if (i > targetDirs * 4) break;
  }

  if (spec.scopeSubtree) dirs.push(spec.scopeSubtree);
  if (spec.ignore === 'pruning') {
    for (let n = 0; n < 20; n++) dirs.push(`vendor/bundle-${n}`);
  }

  return dirs;
}

/**
 * Ignore files to write, keyed by relative directory.
 * @param {Object} spec - Fixture spec
 * @param {string[]} dirs - Directories in the fixture
 * @returns {Map<string, string>} Relative path -> file contents
 */
function buildIgnoreFiles(spec, dirs) {
  const out = new Map();

  if (spec.ignore === 'none') return out;

  out.set('.gitignore', ['node_modules/', '*.log', '.DS_Store', 'dist/', ''].join('\n'));

  if (spec.ignore === 'nested') {
    // One .gitignore per level, so the layer stack grows with depth. This is
    // what makes the per-entry ignore evaluation cost visible.
    for (const dir of dirs) {
      out.set(`${dir}/.gitignore`, ['*.tmp', '*.bak', 'cache/', ''].join('\n'));
    }
  }

  if (spec.ignore === 'pruning') {
    out.set(
      '.gitignore',
      ['node_modules/', '*.log', '.DS_Store', 'dist/', 'vendor/', ''].join('\n'),
    );
  }

  return out;
}

/**
 * Generate (or reuse) a fixture on disk.
 *
 * @param {string} name - Fixture name from {@link FIXTURE_SPECS}
 * @param {Object} [options] - Generation options
 * @param {boolean} [options.force=false] - Regenerate even when cached
 * @param {(msg: string) => void} [options.log] - Progress sink
 * @returns {Promise<Object>} Fixture descriptor with `path` and metadata
 */
export async function ensureFixture(name, options = {}) {
  const spec = FIXTURE_SPECS[name];
  if (!spec) throw new Error(`Unknown fixture: ${name}`);

  const hash = specHash(name, spec);
  const dir = path.join(FIXTURE_ROOT, `${name}-${hash}`);
  const manifestPath = path.join(dir, '.bench-manifest.json');

  if (!options.force) {
    try {
      const existing = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
      if (existing.hash === hash) return existing;
    } catch {
      // Not generated yet, or generated by an older spec.
    }
  }

  options.log?.(`generating fixture ${name} (${spec.files} files)`);

  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });

  const rng = new SeededRandom(spec.seed);
  const dirs = buildDirectories(rng, spec);

  for (const relative of dirs) {
    await fs.mkdir(path.join(dir, relative), { recursive: true });
  }

  const ignoreFiles = buildIgnoreFiles(spec, dirs);
  for (const [relative, contents] of ignoreFiles) {
    await fs.writeFile(path.join(dir, relative), contents);
  }

  // Distribute files across directories deterministically.
  const targets = [];
  const prunedDirs = dirs.filter((d) => d.startsWith('vendor/'));
  const normalDirs = dirs.filter((d) => !d.startsWith('vendor/') && d !== spec.scopeSubtree);
  const prunedCount = spec.prunedFraction ? Math.floor(spec.files * spec.prunedFraction) : 0;
  const scopeCount = spec.scopeFiles ?? 0;

  for (let i = 0; i < spec.files; i++) {
    let target;
    if (i < scopeCount && spec.scopeSubtree) {
      target = spec.scopeSubtree;
    } else if (i < scopeCount + prunedCount && prunedDirs.length > 0) {
      target = prunedDirs[i % prunedDirs.length];
    } else {
      target = normalDirs.length > 0 ? normalDirs[i % normalDirs.length] : '';
    }
    targets.push(target);
  }

  let totalBytes = 0;
  let written = 0;

  for (let start = 0; start < targets.length; start += WRITE_BATCH) {
    const batch = targets.slice(start, start + WRITE_BATCH);
    await Promise.all(
      batch.map((target, offset) => {
        const index = start + offset;
        const content = buildContent(rng, index, spec.fileBytes ?? 1024);
        totalBytes += content.length;
        written++;
        const relative = target ? `${target}/file-${index}.js` : `file-${index}.js`;
        return fs.writeFile(path.join(dir, relative), content);
      }),
    );
  }

  await fs.writeFile(path.join(dir, 'package.json'), '{"name":"bench-fixture"}\n');
  await fs.writeFile(path.join(dir, 'README.md'), '# bench fixture\n');

  const descriptor = {
    schemaVersion: 'copytree-fixture@1',
    name,
    hash,
    path: dir,
    seed: spec.seed,
    fileCount: written,
    directoryCount: dirs.length,
    totalBytes,
    topology: spec.topology,
    ignoreProfile: spec.ignore,
    ...(spec.scopeSubtree ? { scopeSubtree: spec.scopeSubtree, scopeFiles: scopeCount } : {}),
  };

  await fs.writeFile(manifestPath, JSON.stringify(descriptor, null, 2));
  options.log?.(`  -> ${written} files, ${(totalBytes / 1e6).toFixed(1)} MB at ${dir}`);

  return descriptor;
}

/**
 * Remove every generated fixture.
 * @returns {Promise<void>}
 */
export async function cleanFixtures() {
  await fs.rm(FIXTURE_ROOT, { recursive: true, force: true });
}

export { FIXTURE_ROOT };
