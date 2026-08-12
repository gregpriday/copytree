/**
 * The public API contract.
 *
 * Two failure modes this suite exists to prevent, both of which had already
 * happened:
 *
 * 1. **A declaration that describes something the runtime does not do.** A 63 KB
 *    `.d.ts` that compiles is not evidence of anything; it type-checks against
 *    itself. `buildManifest` and `classifyOutcome` were exported and undeclared;
 *    `getAll()` was declared and did not exist. A consumer discovers the
 *    difference at runtime, in production, having been told by their editor
 *    that it was fine.
 *
 * 2. **An export nobody decided to make public.** The root exported 47 values
 *    including pipeline and transformer internals. Everything reachable from a
 *    `1.0.0` root is semver-stable whether or not that was intended, so the
 *    surface is pinned to a snapshot here: adding to it is a deliberate act
 *    with a diff attached, not a side effect of an `export` keyword.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as root from '../../../src/index.js';
import * as advanced from '../../../src/advanced.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * The approved public API.
 *
 * Changing this list is a semver decision. A new name is at minimum a minor
 * release; a removed or renamed one is a major.
 */
const STABLE_ROOT_API = [
  'default',
  // Operations
  'copy',
  'copyStream',
  'scan',
  'format',
  'formatStream',
  // Configuration
  'ConfigManager',
  // Stable vocabularies
  'EXCLUSION_REASONS',
  'MANIFEST_OUTCOMES',
  'buildManifest',
  'classifyOutcome',
  'OUTPUT_FORMAT_VERSIONS',
  'versionFor',
  'PIPELINE_STAGES',
  'estimateTokens',
  'estimateOutputChars',
  'CHARS_PER_TOKEN',
  // Errors
  'CopyTreeError',
  'CommandError',
  'FileSystemError',
  'ConfigurationError',
  'ValidationError',
  'ScopeError',
  'PipelineError',
  'TransformError',
  'GitError',
  'ProfileError',
  'InstructionsError',
  'SecretsDetectedError',
  'PolicyError',
  'ERROR_CODES',
  'EXIT_CODES',
  'exitCodeFor',
  'createAbortError',
  'isAbortError',
];

/** The extension points, versioned separately and allowed to move in a minor. */
const ADVANCED_API = [
  'Pipeline',
  'Stage',
  'TransformerRegistry',
  'BaseTransformer',
  'ProgressTracker',
  'stageIdFor',
  'ExclusionReport',
  'resolveScope',
  'categorizeByExt',
  'detectBinary',
  'serialize',
  'render',
  'buildDocument',
  'canonicalFormat',
  'FORMATS',
];

/**
 * Every name a declaration file exports as a *value*.
 *
 * Interfaces and type aliases are excluded: they have no runtime counterpart,
 * so comparing them against the module's exports would be meaningless.
 *
 * Read with regular expressions rather than the TypeScript compiler. These are
 * hand-written declaration files with a deliberately regular shape, and the
 * alternative pulls a CommonJS compiler into an ESM test to answer a question
 * about the first token of a line.
 *
 * @param {string} file - Path to a `.d.ts`
 * @returns {Set<string>} Exported value names
 */
function declaredValueExports(file) {
  const text = readFileSync(file, 'utf8');
  const names = new Set();

  // Value declarations. `let`/`var`/`enum`/`namespace`/`abstract class` are
  // included because omitting them is not a smaller check — it is a check that
  // passes while the contract is broken.
  for (const match of text.matchAll(
    /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:function|const|let|var|class|enum|namespace)\s+([A-Za-z0-9_$]+)/gm,
  )) {
    names.add(match[1]);
  }

  // `export const A: number, B: number;` declares both. Split only on commas
  // at nesting depth zero: `Readonly<Record<string, ErrorCode>>` contains a
  // comma that separates type arguments, not declarators. The character class
  // also excludes newlines, or a declaration with no `;` on its own line runs
  // on through the prose that follows it.
  for (const match of text.matchAll(/^export\s+(?:declare\s+)?(?:const|let|var)\s+([^;\n]+)/gm)) {
    const parts = [];
    let depth = 0;
    let current = '';

    for (const char of match[1]) {
      if ('<([{'.includes(char)) depth += 1;
      else if ('>)]}'.includes(char)) depth -= 1;

      if (char === ',' && depth === 0) {
        parts.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    parts.push(current);

    for (const part of parts) {
      const name = part.trim().match(/^([A-Za-z0-9_$]+)/)?.[1];
      if (name) names.add(name);
    }
  }

  // `export default` — but `export default interface` declares no value.
  if (/^export\s+default\s+(?!interface\b|type\b)/m.test(text)) names.add('default');

  for (const match of text.matchAll(/^export\s*(?:type\s*)?\{([^}]*)\}/gm)) {
    // `export type { ... }` is entirely type-only.
    if (/^export\s*type\s*\{/.test(match[0])) continue;

    for (const entry of match[1].split(',')) {
      const specifier = entry.trim();
      if (!specifier) continue;
      // `export { type Foo as Bar }` is type-only for `Bar` too — the marker is
      // on the left of the alias, so it has to be checked before splitting.
      if (/^type\s/.test(specifier)) continue;
      const name = specifier
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (name) names.add(name);
    }
  }

  // A star re-export hides whatever the other module exports, so the
  // comparison below would be meaningless. Fail loudly rather than quietly.
  if (/^export\s+\*/m.test(text)) {
    throw new Error(`${file} uses a star re-export; this parser cannot see through it`);
  }

  return names;
}

describe('the package root', () => {
  it('exports exactly the approved API', () => {
    expect(Object.keys(root).sort()).toEqual([...STABLE_ROOT_API].sort());
  });

  it('does not export the deprecated configuration singletons', () => {
    // A process-wide mutable configuration is the opposite of the isolation an
    // embedded library has to offer.
    expect(root.config).toBeUndefined();
    expect(root.configAsync).toBeUndefined();
  });

  it('does not export pipeline or transformer internals', () => {
    for (const name of ['Pipeline', 'Stage', 'TransformerRegistry', 'BaseTransformer']) {
      expect(root[name]).toBeUndefined();
    }
  });

  it('matches its declaration file exactly', () => {
    const declared = declaredValueExports(path.join(repoRoot, 'types/index.d.ts'));
    const runtime = new Set(Object.keys(root));

    const undeclared = [...runtime].filter((name) => !declared.has(name)).sort();
    const phantom = [...declared].filter((name) => !runtime.has(name)).sort();

    expect({ undeclared, phantom }).toEqual({ undeclared: [], phantom: [] });
  });
});

describe('the advanced subpath', () => {
  it('exports exactly the approved extension points', () => {
    expect(Object.keys(advanced).sort()).toEqual([...ADVANCED_API].sort());
  });

  it('matches its declaration file exactly', () => {
    const declared = declaredValueExports(path.join(repoRoot, 'types/advanced.d.ts'));
    const runtime = new Set(Object.keys(advanced));

    const undeclared = [...runtime].filter((name) => !declared.has(name)).sort();
    const phantom = [...declared].filter((name) => !runtime.has(name)).sort();

    expect({ undeclared, phantom }).toEqual({ undeclared: [], phantom: [] });
  });
});

describe('declared runtime behaviour matches the runtime', () => {
  it('declares every exclusion reason the runtime can produce', () => {
    const declaration = readFileSync(path.join(repoRoot, 'types/index.d.ts'), 'utf8');
    const union = declaration.match(/export type ExclusionReason =([\s\S]*?);/)?.[1] ?? '';

    for (const reason of Object.values(root.EXCLUSION_REASONS)) {
      // A reason the runtime emits but the declaration omits makes an
      // exhaustive `switch` in a consumer's code fail to compile — or worse,
      // silently fall through.
      expect(union).toContain(`'${reason}'`);
    }
  });

  it('declares every pipeline stage id the runtime can report', () => {
    const declaration = readFileSync(path.join(repoRoot, 'types/index.d.ts'), 'utf8');
    const union = declaration.match(/export type PipelineStageId =([\s\S]*?);/)?.[1] ?? '';

    for (const stage of Object.values(root.PIPELINE_STAGES)) {
      expect(union).toContain(`'${stage}'`);
    }
  });

  it('declares no stage id the runtime cannot report', () => {
    const declaration = readFileSync(path.join(repoRoot, 'types/index.d.ts'), 'utf8');
    const union = declaration.match(/export type PipelineStageId =([\s\S]*?);/)?.[1] ?? '';
    // `[A-Za-z]`, not `[a-z]`: a lowercase-only class silently skipped
    // `alwaysInclude` and so reported a clean result for the one entry that
    // was actually wrong.
    const declared = [...union.matchAll(/'([A-Za-z-]+)'/g)].map((match) => match[1]);
    const actual = new Set(Object.values(root.PIPELINE_STAGES));

    // `alwaysInclude`, `filter` and `limit` outlived the stages they named.
    expect(declared.filter((id) => !actual.has(id))).toEqual([]);
  });

  it('declares every manifest outcome the runtime can produce', () => {
    const declaration = readFileSync(path.join(repoRoot, 'types/index.d.ts'), 'utf8');

    for (const outcome of Object.values(root.MANIFEST_OUTCOMES)) {
      expect(declaration).toContain(`'${outcome}'`);
    }
  });

  it('declares every error code the runtime can throw', () => {
    const declaration = readFileSync(path.join(repoRoot, 'types/index.d.ts'), 'utf8');

    for (const code of Object.values(root.ERROR_CODES)) {
      expect(declaration).toContain(`'${code}'`);
    }
  });

  it('carries no hard-coded version', () => {
    const declaration = readFileSync(path.join(repoRoot, 'types/index.d.ts'), 'utf8');

    // A version pinned in a hand-maintained file is one more thing to forget on
    // release day, and it is wrong the moment it is written.
    expect(declaration).not.toMatch(/@version\s+\d+\.\d+\.\d+/);
  });
});
