/**
 * Every declared option is an option the runtime actually reads.
 *
 * `CopyOptions` advertised `secretsReport`, `info` and `verbose`. None of them
 * did anything: they were CLI concerns that had been copied into the SDK's
 * declarations, so a TypeScript consumer got autocomplete, a green build, and
 * no secrets report. `FormatStreamOptions` advertised `onProgress` and
 * `formatStream()` never called it. In the other direction, `profile: false`
 * worked at runtime and was rejected by the compiler.
 *
 * A `.d.ts` cannot be trusted to describe behaviour just because it compiles.
 * This scans the declared option names and checks each one against the runtime
 * module that is supposed to honour it.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const declaration = readFileSync(path.join(repoRoot, 'types/index.d.ts'), 'utf8');

/**
 * Read a source file from the repository, with its comments removed.
 *
 * Comments have to go, or the search answers the wrong question. Every one of
 * these modules documents its options in a JSDoc block, so `secretsReport` —
 * declared, documented, and implemented nowhere — appeared to be handled purely
 * because its own `@property` line mentioned it. That is precisely the bug this
 * file is here to catch.
 *
 * @param {string} relative - Path relative to the repository root
 * @returns {string} File contents, comment-free
 */
const source = (relative) =>
  readFileSync(path.join(repoRoot, relative), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

/**
 * The option names an interface declares.
 * @param {string} name - Interface name
 * @returns {string[]} Declared property names
 */
function declaredOptions(name) {
  const body = declaration.match(
    new RegExp(`export interface ${name}[^{]*\\{([\\s\\S]*?)\\n\\}`),
  )?.[1];
  if (body === undefined) throw new Error(`No interface ${name} in types/index.d.ts`);

  return [...body.matchAll(/^ {2}(\w+)\??:/gm)].map((match) => match[1]);
}

/**
 * Options whose handling lives somewhere the naive search cannot see, with the
 * reason. Anything not listed here has to appear in the runtime it belongs to.
 */
const HANDLED_ELSEWHERE = {
  // Consumed by `resolveOperationConfig()` and threaded through as
  // `configInstance`, so the option name itself appears only there.
  config: 'src/api/operationConfig.js',
  // Read by the selection engine, which every entry point builds its stages
  // from, rather than by the entry point module.
  exclude: 'src/selection/selection.js',
  include: 'src/selection/selection.js',
  always: 'src/selection/selection.js',
  scope: 'src/selection/selection.js',
  sort: 'src/selection/selection.js',
  sortOrder: 'src/selection/selection.js',
  maxFileSize: 'src/selection/selection.js',
  maxTotalSize: 'src/selection/selection.js',
  maxFileCount: 'src/selection/selection.js',
  sizeGate: 'src/selection/selection.js',
  explain: 'src/selection/selection.js',
  respectGitignore: 'src/selection/selection.js',
  tests: 'src/selection/selection.js',
  binary: 'src/selection/selection.js',
};

/** Where each formatter option is finally read. */
const FORMATTER_FILES = [
  'src/formatters/document.js',
  'src/formatters/index.js',
  'src/formatters/xml.js',
  'src/formatters/json.js',
  'src/formatters/markdown.js',
  'src/formatters/ndjson.js',
  'src/formatters/sarif.js',
  'src/formatters/tree.js',
];

describe.each([
  ['ScanOptions', ['src/api/scan.js']],
  ['CopyOptions', ['src/api/copy.js', ...FORMATTER_FILES]],
  ['FormatOptions', ['src/api/format.js', ...FORMATTER_FILES]],
  ['FormatStreamOptions', ['src/api/formatStream.js', 'src/api/format.js', ...FORMATTER_FILES]],
  ['CopyStreamOptions', ['src/api/copyStream.js', ...FORMATTER_FILES]],
])('%s', (interfaceName, runtimeFiles) => {
  it('declares no option the runtime never reads', () => {
    const options = declaredOptions(interfaceName);
    expect(options.length).toBeGreaterThan(0);

    const phantom = options.filter((option) => {
      const files = [...runtimeFiles, HANDLED_ELSEWHERE[option]].filter(Boolean);

      return !files.some((file) => {
        const text = source(file);
        // The runtime either reads it off an options bag, destructures it, or
        // forwards it under its own name.
        return (
          text.includes(`options.${option}`) ||
          text.includes(`.${option}`) ||
          new RegExp(`(^|[{,\\s])${option}\\s*[,:}=]`, 'm').test(text)
        );
      });
    });

    expect({ interfaceName, phantom }).toEqual({ interfaceName, phantom: [] });
  });
});

describe('options the runtime honours are declared', () => {
  it('declares profile: false, which disables discovery', () => {
    // Runtime: `profileDisabled: options.profile === false`.
    expect(source('src/api/scan.js')).toContain('options.profile === false');
    expect(declaration).toMatch(/profile\?: string \| false;/);
  });

  it.each(['includeMetadata', 'reproducible'])('declares the %s format option', (option) => {
    expect(source('src/formatters/document.js')).toContain(option);
    expect(declaredOptions('FormatOptions')).toContain(option);
  });

  it('does not declare a progress callback on formatStream, which has no phases', () => {
    // `formatStream()` prepares the whole document before the first chunk, so
    // any percentage it reported would be 0 and then 100. The option was
    // declared and silently dropped.
    expect(declaredOptions('FormatStreamOptions')).not.toContain('onProgress');
    expect(source('src/api/formatStream.js')).not.toContain('onProgress(');
  });

  it.each(['secretsReport', 'info', 'verbose'])(
    'does not declare %s, which is a CLI concern the SDK never implemented',
    (option) => {
      expect(declaredOptions('CopyOptions')).not.toContain(option);
    },
  );
});
