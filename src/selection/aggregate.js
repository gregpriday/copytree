/**
 * Aggregation and role hints for the inventory reports.
 *
 * Every function here is deterministic and derived only from paths and sizes.
 * Nothing reads a file. Role hints in particular are advisory labels attached
 * to directories so an agent can tell docs from fixtures at a glance — they
 * never alter selection, and the reports call them hints for that reason.
 */

/** Directory-name conventions, mapped to the role they usually indicate. */
const DIRECTORY_ROLES = Object.freeze([
  [['docs', 'doc', 'documentation', 'website', 'site'], 'documentation'],
  [['test', 'tests', '__tests__', 'spec', 'specs', 'e2e', 'integration'], 'tests'],
  [
    [
      'fixture',
      'fixtures',
      '__fixtures__',
      'testdata',
      'golden',
      'goldens',
      'snapshots',
      '__snapshots__',
    ],
    'fixtures',
  ],
  [['example', 'examples', 'demo', 'demos', 'sample', 'samples', 'playground'], 'examples'],
  [['bench', 'benchmark', 'benchmarks', 'perf'], 'benchmarks'],
  [
    ['dist', 'build', 'out', 'target', 'coverage', 'reports', 'generated', '__generated__'],
    'generated',
  ],
  [['src', 'lib', 'app', 'source', 'sources', 'internal', 'pkg', 'cmd'], 'source'],
  [['script', 'scripts', 'tools', 'tooling'], 'scripts'],
  [['asset', 'assets', 'static', 'public', 'images', 'img', 'media', 'fonts'], 'assets'],
  [['.github', '.gitlab', 'ci', '.circleci'], 'project-config'],
  [['migration', 'migrations', 'schema', 'schemas'], 'schema'],
  [['locale', 'locales', 'i18n', 'translations'], 'localization'],
  [['vendor', 'third_party', 'thirdparty', 'node_modules'], 'vendored'],
]);

/** Root-level filenames that reliably indicate project configuration. */
const PROJECT_CONFIG_FILES = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'tsconfig.json',
  'jsconfig.json',
  'cargo.toml',
  'cargo.lock',
  'go.mod',
  'go.sum',
  'pyproject.toml',
  'setup.py',
  'requirements.txt',
  'pom.xml',
  'build.gradle',
  'gemfile',
  'composer.json',
  'makefile',
  'dockerfile',
]);

/** Filename patterns that indicate machine-generated content. */
const GENERATED_PATTERNS = [
  /\.min\.(js|css)$/i,
  /\.map$/i,
  /\.lock$/i,
  /(^|[.\-_])generated([.\-_]|$)/i,
  /\.pb\.(go|js|ts)$/i,
  /_pb2\.py$/i,
  /\.d\.ts$/i,
];

/**
 * A deterministic role hint for a path.
 *
 * Hints are advisory: a project is free to keep its core logic in `examples/`,
 * and the report says "hints" rather than "classification" precisely because
 * CopyTree cannot know that and the reader can.
 *
 * @param {string} posixPath - Root-relative POSIX path
 * @returns {string|null} Role hint, or null when nothing is indicated
 */
export function roleHintFor(posixPath) {
  if (!posixPath) return null;
  const segments = posixPath.split('/').filter(Boolean);
  const fileName = segments.at(-1) ?? '';

  if (segments.length === 1 && PROJECT_CONFIG_FILES.has(fileName.toLowerCase())) {
    return 'project-config';
  }
  if (GENERATED_PATTERNS.some((pattern) => pattern.test(fileName))) return 'generated';

  // Deepest match wins: `src/__tests__` is tests, not source.
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index].toLowerCase();
    for (const [names, role] of DIRECTORY_ROLES) {
      if (names.includes(segment)) return role;
    }
  }

  return null;
}

/**
 * Aggregate a file list by top-level directory and by extension.
 *
 * @param {Array<{path: string, size: number}>} files - Files to aggregate
 * @param {Object} [options={}] - Options
 * @param {number} [options.depth=1] - Directory grouping depth
 * @param {boolean} [options.hints=true] - Attach role hints
 * @returns {{directories: Array, extensions: Array, rootFiles: Array}} Aggregates
 */
export function aggregate(files, options = {}) {
  const depth = options.depth ?? 1;
  const withHints = options.hints !== false;

  const directories = new Map();
  const extensions = new Map();
  const rootFiles = [];

  for (const file of files) {
    const segments = file.path.split('/');
    const size = file.size || 0;

    if (segments.length === 1) {
      rootFiles.push({
        path: file.path,
        size,
        ...(withHints ? { hint: roleHintFor(file.path) } : {}),
      });
    } else {
      const key = `${segments.slice(0, Math.min(depth, segments.length - 1)).join('/')}/`;
      const bucket = directories.get(key) ?? {
        path: key,
        files: 0,
        bytes: 0,
        extensions: new Map(),
        hint: withHints ? roleHintFor(key.slice(0, -1)) : null,
      };
      bucket.files += 1;
      bucket.bytes += size;
      const ext = extensionOf(file.path);
      bucket.extensions.set(ext, (bucket.extensions.get(ext) ?? 0) + 1);
      directories.set(key, bucket);
    }

    const ext = extensionOf(file.path);
    const entry = extensions.get(ext) ?? { extension: ext, files: 0, bytes: 0 };
    entry.files += 1;
    entry.bytes += size;
    extensions.set(ext, entry);
  }

  return {
    directories: [...directories.values()]
      .map((bucket) => ({
        path: bucket.path,
        files: bucket.files,
        bytes: bucket.bytes,
        hint: bucket.hint,
        mainExtensions: [...bucket.extensions.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 3)
          .map(([extension, count]) => ({ extension, count })),
      }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    extensions: [...extensions.values()].sort(
      (a, b) => b.files - a.files || a.extension.localeCompare(b.extension),
    ),
    rootFiles: rootFiles.sort((a, b) => a.path.localeCompare(b.path)),
  };
}

/**
 * Build a nested directory tree with per-directory totals.
 *
 * @param {Array<{path: string, size: number}>} files - Files
 * @param {Object} [options={}] - Options
 * @param {number} [options.depth=4] - Expansion depth
 * @returns {Array} Tree nodes, each `{name, path, files, bytes, children}`
 */
export function buildAggregateTree(files, options = {}) {
  const maxDepth = options.depth ?? 4;
  const root = { name: '', path: '', files: 0, bytes: 0, children: new Map(), isFile: false };

  for (const file of files) {
    const segments = file.path.split('/');
    let node = root;
    node.files += 1;
    node.bytes += file.size || 0;

    for (let index = 0; index < segments.length; index += 1) {
      const isLeaf = index === segments.length - 1;
      // Below the expansion depth, everything folds into the deepest visible
      // ancestor's totals rather than vanishing.
      if (index >= maxDepth) break;

      const name = segments[index];
      const childPath = node.path ? `${node.path}/${name}` : name;
      let child = node.children.get(name);
      if (!child) {
        child = {
          name,
          path: childPath,
          files: 0,
          bytes: 0,
          children: new Map(),
          isFile: isLeaf,
        };
        node.children.set(name, child);
      }
      child.files += 1;
      child.bytes += file.size || 0;
      node = child;
    }
  }

  const toArray = (node) =>
    [...node.children.values()]
      .sort((a, b) => {
        if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
        return a.name.localeCompare(b.name);
      })
      .map((child) => ({
        name: child.name,
        path: child.path,
        files: child.files,
        bytes: child.bytes,
        isFile: child.isFile,
        children: toArray(child),
      }));

  return toArray(root);
}

/**
 * Lowercase extension including the dot, or an empty string.
 * @param {string} posixPath - Path
 * @returns {string} Extension
 */
function extensionOf(posixPath) {
  const base = posixPath.split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot).toLowerCase() : '';
}
