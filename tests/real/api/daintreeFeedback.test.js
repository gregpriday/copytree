/**
 * Regressions reported against 0.15 pre-release by the embedding application.
 *
 * These run against a real temporary repository rather than mocks, because
 * every one of them was invisible to the unit suite: they live in the seams
 * between stages, between the dry run and the real run, and between what the
 * types promise and what `stats` actually carries.
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { copy } from '../../../src/api/copy.js';
import { PIPELINE_STAGES } from '../../../src/utils/ProgressTracker.js';

// A synthetic, never-issued credential shaped like a Stripe secret key, used
// only to exercise the secrets guard. Assembled at runtime so it never
// appears as one contiguous literal in this file — secret scanners
// (including GitHub push protection) match on the raw file text, not the
// evaluated JS value.
const STRIPE_SECRET_KEY = ['sk', 'live', '4eC39HqLyjWDarjtT1zdp7dc'].join('_');

let repo;

beforeEach(async () => {
  repo = await fs.mkdtemp(path.join(os.tmpdir(), 'copytree-feedback-'));
});

afterEach(async () => {
  await fs.remove(repo);
});

/**
 * Write a file inside the fixture repository.
 * @param {string} relativePath - Path relative to the repository root
 * @param {string} content - File content
 * @returns {Promise<void>}
 */
async function write(relativePath, content) {
  const target = path.join(repo, relativePath);
  await fs.ensureDir(path.dirname(target));
  await fs.writeFile(target, content, 'utf8');
}

describe('secrets guard does not corrupt source', () => {
  it('leaves ordinary TypeScript untouched', async () => {
    const source = [
      'const token = payload.token.trim();',
      'const bearer = extractBearerToken(authHeader);',
      'export function classify() {',
      '  // Token classification: high entropy',
      '  return process.env.DB_PASSWORD;',
      '}',
    ].join('\n');

    await write('src/auth.ts', source);

    const result = await copy(repo, {});
    const file = result.files.find((f) => f.path === 'src/auth.ts');

    expect(file.content).toBe(source);
    expect(result.output).not.toContain('REDACTED');
    expect(result.stats.secretsGuard.findings).toBe(0);
  });

  it('redacts a real credential without breaking the statement', async () => {
    await write('src/config.ts', `const apiKey = "${STRIPE_SECRET_KEY}";\n`);

    const result = await copy(repo, {});
    const file = result.files.find((f) => f.path === 'src/config.ts');

    expect(file.content).toBe('const apiKey = "***REDACTED:PROVIDER_TOKEN***";\n');
    expect(file.content).not.toContain('sk_live_');
    expect(result.stats.secretsGuard.redacted).toBe(1);
  });
});

describe('never-binary extensions survive a NUL byte', () => {
  it('keeps a .ts file containing a literal NUL as text', async () => {
    const source = 'const sep = `${a}\0${b}`;\nexport default sep;\n';
    await write('src/dedup.ts', source);

    const result = await copy(repo, {});
    const file = result.files.find((f) => f.path === 'src/dedup.ts');
    const entry = result.manifest.find((f) => f.path === 'src/dedup.ts');

    expect(file.isBinary).toBe(false);
    expect(entry.outcome).toBe('included');
    expect(file.content).toContain('export default sep;');
  });
});

describe('dry run selects what the real run selects', () => {
  it('applies secret-file exclusions in both', async () => {
    await write('src/index.ts', 'export const a = 1;\n');
    await write('.env', 'SECRET=abc\n');
    await write('server.pem', 'not really a key\n');

    const plan = await copy(repo, { dryRun: true });
    const real = await copy(repo, {});

    expect(plan.stats.totalFiles).toBe(real.stats.totalFiles);
    expect(plan.stats.excluded.byReason.secretFile).toBe(real.stats.excluded.byReason.secretFile);
    expect(plan.manifest.map((f) => f.path)).toEqual(real.manifest.map((f) => f.path));
  });

  it('reports that nothing was scanned in a plan', async () => {
    await write('src/index.ts', 'export const a = 1;\n');

    const plan = await copy(repo, { dryRun: true });

    expect(plan.stats.secretsGuard.planOnly).toBe(true);
    expect(plan.stats.secretsGuard.scanner).toBe('none');
  });
});

describe('copy() callbacks', () => {
  it('forwards the stable stage id on progress', async () => {
    await write('src/index.ts', 'export const a = 1;\n');

    const seen = [];
    await copy(repo, {
      onProgress: (progress) => seen.push(progress),
      progressThrottleMs: 0,
    });

    expect(seen.length).toBeGreaterThan(0);
    for (const progress of seen) {
      expect(progress).toHaveProperty('stage');
      expect(typeof progress.percent).toBe('number');
    }

    const stages = new Set(seen.map((p) => p.stage));
    const known = new Set(Object.values(PIPELINE_STAGES));
    for (const stage of stages) {
      expect(known.has(stage)).toBe(true);
    }
    // The scan phase has to be visible, not just the wrapper's own bookends.
    expect(stages.size).toBeGreaterThan(1);
  });

  it('calls a caller-supplied onSummary', async () => {
    await write('src/index.ts', 'export const a = 1;\n');

    const summaries = [];
    const result = await copy(repo, { onSummary: (s) => summaries.push(s) });

    expect(summaries).toHaveLength(1);
    expect(summaries[0].totalFiles).toBe(result.stats.totalFiles);
    expect(summaries[0].excluded).toBeDefined();
  });

  it('calls onSummary on a dry run too', async () => {
    await write('src/index.ts', 'export const a = 1;\n');

    const summaries = [];
    await copy(repo, { dryRun: true, onSummary: (s) => summaries.push(s) });

    expect(summaries).toHaveLength(1);
  });

  it('survives a throwing onSummary', async () => {
    await write('src/index.ts', 'export const a = 1;\n');

    await expect(
      copy(repo, {
        onSummary: () => {
          throw new Error('consumer bug');
        },
      }),
    ).resolves.toBeDefined();
  });
});

describe('stats carry what the stages computed', () => {
  it('populates stats.secretsGuard', async () => {
    await write('src/index.ts', 'export const a = 1;\n');

    const { stats } = await copy(repo, {});

    expect(stats.secretsGuard).toMatchObject({
      enabled: true,
      planOnly: false,
      findings: expect.any(Number),
      redacted: expect.any(Number),
      excludedSecretFiles: expect.any(Number),
      excludedUnscannable: expect.any(Number),
    });
    expect(stats.secretsGuard.report.findings).toEqual([]);
  });

  it('omits stats.secretsGuard when the guard is off', async () => {
    await write('src/index.ts', 'export const a = 1;\n');

    const { stats } = await copy(repo, { secretsGuard: false });

    expect(stats.secretsGuard).toBeUndefined();
  });

  it('reports which budget dropped files', async () => {
    for (let i = 0; i < 6; i++) {
      await write(`src/file${i}.ts`, `export const v${i} = ${i};\n`);
    }

    const { stats } = await copy(repo, { maxFileCount: 2 });

    expect(stats.truncated).toBe(true);
    expect(stats.truncatedBy).toBe('maxFileCount');
    expect(stats.truncatedByCountBudget).toBeGreaterThan(0);
  });

  it('reports character budget detail', async () => {
    await write('src/index.ts', 'export const a = 1;\n'.repeat(50));

    const { stats } = await copy(repo, { charLimit: 100 });

    expect(stats.characterLimit).toBe(100);
    expect(typeof stats.totalCharacters).toBe('number');
  });
});

describe('scope can reach config-excluded directories', () => {
  beforeEach(async () => {
    await write('src/index.ts', 'export const a = 1;\n');
    await write('node_modules/pkg/index.js', 'module.exports = 1;\n');
    await write('.gitignore', 'node_modules/\n');
  });

  it('excludes node_modules by default', async () => {
    const result = await copy(repo, { scope: ['node_modules/pkg'] });
    expect(result.stats.totalFiles).toBe(0);
    expect(result.stats.noFilesMatched).toBe(true);
  });

  it('includes it when both overrides are set', async () => {
    const result = await copy(repo, {
      scope: ['node_modules/pkg'],
      scopeIgnoresIgnoreFiles: true,
      scopeIgnoresConfigExcludes: true,
    });

    expect(result.stats.totalFiles).toBe(1);
    expect(result.manifest[0].path).toBe('node_modules/pkg/index.js');
  });

  describe('never reaches .git', () => {
    beforeEach(async () => {
      await write('.git/config', '[core]\n\trepositoryformatversion = 0\n');
      await write('.git/objects/ab/cdef', 'packed\n');
    });

    /**
     * Every override combination that could plausibly reach git metadata.
     * `always` is the interesting one: force-includes run through `fast-glob`
     * with `ignore: []`, so they bypass the ignore layers by design.
     */
    it.each([
      ['both scope overrides', { scope: ['.git'] }],
      ['scope overrides plus includeHidden', { scope: ['.git'], includeHidden: true }],
      ['a force-include naming it', { includeHidden: true, always: ['.git/**'] }],
      ['scope plus force-include', { scope: ['.git'], includeHidden: true, always: ['.git/**'] }],
      ['a scoped file inside it', { scope: ['.git/config'], includeHidden: true }],
    ])('is unreachable via %s', async (_label, options) => {
      const result = await copy(repo, {
        ...options,
        scopeIgnoresIgnoreFiles: true,
        scopeIgnoresConfigExcludes: true,
      });

      expect(result.manifest.filter((f) => f.path.startsWith('.git/'))).toEqual([]);
    });
  });

  it('leaves a normal run unaffected', async () => {
    const result = await copy(repo, { scopeIgnoresConfigExcludes: true });
    expect(result.manifest.every((f) => !f.path.startsWith('node_modules/'))).toBe(true);
  });
});

describe('the programmatic API is silent', () => {
  it('writes nothing to the terminal while redacting', async () => {
    await write('src/config.ts', `const apiKey = "${STRIPE_SECRET_KEY}";\n`);

    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    try {
      const result = await copy(repo, {});
      expect(result.stats.secretsGuard.redacted).toBe(1);
      expect(stdout).not.toHaveBeenCalled();
      expect(stderr).not.toHaveBeenCalled();
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
    }
  });

  it('still delivers stage messages as events', async () => {
    await write('src/config.ts', `const apiKey = "${STRIPE_SECRET_KEY}";\n`);

    const logs = [];
    await copy(repo, {
      onEvent: (event) => {
        if (event.type === 'stage:log') logs.push(event.data);
      },
    });

    expect(logs.some((entry) => entry.stage === 'SecretsGuardStage')).toBe(true);
  });
});
