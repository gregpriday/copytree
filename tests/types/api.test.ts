/**
 * Type Tests for CopyTree API
 *
 * These tests verify that TypeScript type definitions are correct.
 * They don't run at runtime - they're checked by `tsc --noEmit`.
 *
 * If this file compiles without errors, the types are correct.
 */

import {
  copy,
  copyStream,
  scan,
  format,
  estimateTokens,
  ConfigManager,
  EXCLUSION_REASONS,
  ProgressEvent,
  ProgressCallback,
  CopyOptions,
  CopyResult,
  ScanOptions,
  ScanSummary,
  FormatOptions,
  FileResult,
  ManifestEntry,
  ManifestOutcome,
  ExclusionSummary,
  ExclusionDetail,
  ExclusionReason,
  ErrorCode,
} from 'copytree';

// ============================================================================
// ConfigManager Tests
// ============================================================================

async function testConfigManager() {
  // Test static factory method
  const config = await ConfigManager.create();
  const configWithOptions = await ConfigManager.create({ noValidate: true });

  // Test get with generic type
  const stringValue: string = config.get<string>('app.name', 'default');
  const numberValue: number = config.get<number>('app.maxFiles', 1000);
  const boolValue: boolean = config.get<boolean>('app.debug', false);

  // Test get with default value inference
  const inferred = config.get('some.path', { nested: true });

  // Test set
  config.set('app.debug', true);
  config.set('app.name', 'test');

  // Test has
  const exists: boolean = config.has('app.name');

  // Test all
  const allConfig: Record<string, any> = config.all();

  // Test reload
  await config.reload();

  // Test effective
  const effective = config.effective();
  const effectiveEntry = effective['app.name'];
  const value: any = effectiveEntry.value;
  const source: string = effectiveEntry.source;
  const type: string = effectiveEntry.type;
  const redacted: boolean = effectiveEntry.redacted;

  // Test effective with options
  const effectiveRedacted = config.effective({ redact: true });
  const effectiveSection = config.effective({ section: 'app' });

  // Test validation methods
  config.setValidationEnabled(true);
  const isEnabled: boolean = config.isValidationEnabled();
}

// ============================================================================
// Progress Types Tests
// ============================================================================

function testProgressTypes() {
  // Test ProgressEvent shape
  // The shape the runtime actually emits. It used to be declared as
  // `filesProcessed` / `totalFiles` / `currentFile` / `timestamp`, none of
  // which any stage has ever set.
  const event: ProgressEvent = {
    percent: 50,
    message: 'Processing files...',
    // Stable stage id, never a class name — consumers render this directly.
    stage: 'discover',
    phase: 'discover',
    completed: 100,
    total: 200,
    item: 'src/index.ts',
  };

  // Test minimal ProgressEvent (only required fields)
  const minimalEvent: ProgressEvent = {
    percent: 0,
    message: 'Starting...',
  };

  // Test ProgressCallback type
  const callback: ProgressCallback = (progress) => {
    console.log(`${progress.percent}% - ${progress.message}`);
    if (progress.stage) {
      console.log(`Stage: ${progress.stage}`);
    }
  };
}

// ============================================================================
// Scan API Tests
// ============================================================================

async function testScanApi() {
  // Basic scan
  for await (const file of scan('./src')) {
    const path: string = file.path;
    const absolutePath: string = file.absolutePath;
    const size: number = file.size;
    const modified: Date = file.modified;
    const isBinary: boolean = file.isBinary;
    // `Uint8Array`, not `Buffer`: the published declarations must compile
    // without `@types/node`, which the package does not depend on.
    const content: string | Uint8Array | null | undefined = file.content;
    const encoding: string | undefined = file.encoding;
    const gitStatus: string | undefined = file.gitStatus;
  }

  // Scan with all options
  const config = await ConfigManager.create();
  const options: ScanOptions = {
    filter: ['**/*.ts', '**/*.js'],
    exclude: ['**/node_modules/**'],
    respectGitignore: true,
    modified: false,
    changed: 'main',
    maxDepth: 5,
    transform: true,
    // Keyed by name, not an array: the runtime calls `Object.entries()` on
    // this and reads each entry's `enabled`.
    transformers: { markdown: { enabled: true }, csv: { enabled: false } },
    includeHidden: false,
    followSymlinks: false,
    maxFileSize: 10 * 1024 * 1024,
    maxTotalSize: 100 * 1024 * 1024,
    maxFileCount: 1000,
    always: ['.env.example'],
    withGitStatus: true,
    includeContent: true,
    dedupe: true,
    sort: 'path',
    config: config,
    onProgress: (progress) => {
      console.log(`${progress.percent}%`);
    },
    progressThrottleMs: 100,
  };

  for await (const file of scan('./src', options)) {
    console.log(file.path);
  }

  // Scan with AbortSignal
  const controller = new AbortController();
  for await (const file of scan('./src', { signal: controller.signal })) {
    console.log(file.path);
  }

  // Scan with onEvent callback
  for await (const file of scan('./src', {
    onEvent: (event) => {
      console.log(event.type, event.data);
    },
  })) {
    console.log(file.path);
  }
}

// ============================================================================
// Format API Tests
// ============================================================================

async function testFormatApi() {
  // Format array of files
  const files: FileResult[] = [];
  const xmlOutput: string = await format(files, { format: 'xml' });
  const jsonOutput: string = await format(files, { format: 'json' });
  const markdownOutput: string = await format(files, { format: 'markdown' });
  const treeOutput: string = await format(files, { format: 'tree' });
  const ndjsonOutput: string = await format(files, { format: 'ndjson' });
  const sarifOutput: string = await format(files, { format: 'sarif' });

  // Format with all options
  const options: FormatOptions = {
    format: 'xml',
    onlyTree: false,
    addLineNumbers: true,
    basePath: '/project',
    instructions: 'Review this code',
    showSize: true,
    prettyPrint: true,
  };
  const formatted: string = await format(files, options);

  // Format async iterable (from scan)
  const output: string = await format(scan('./src'), { format: 'json' });

  // Format regular iterable
  const iterable: Iterable<FileResult> = files;
  const iterableOutput: string = await format(iterable, { format: 'xml' });
}

// ============================================================================
// Copy API Tests
// ============================================================================

async function testCopyApi() {
  // Basic copy
  const result: CopyResult = await copy('./src');
  const output: string = result.output;
  const resultFiles: FileResult[] = result.files;
  const totalFiles: number = result.stats.totalFiles;
  const duration: number = result.stats.duration;
  const totalSize: number = result.stats.totalSize;
  const outputSize: number | undefined = result.stats.outputSize;
  const outputPath: string | undefined = result.outputPath;

  // Manifest type checks
  const manifest: ManifestEntry[] = result.manifest;
  manifest.forEach((entry: ManifestEntry) => {
    const entryPath: string = entry.path;
    const entrySize: number = entry.size;
  });

  // Copy with all options
  const config = await ConfigManager.create();
  const options: CopyOptions = {
    // From ScanOptions
    filter: ['**/*.ts'],
    exclude: ['**/*.test.ts'],
    respectGitignore: true,
    modified: true,
    changed: 'develop',
    maxDepth: 10,
    transform: true,
    transformers: { markdown: { enabled: true } },
    includeHidden: false,
    followSymlinks: false,
    maxFileSize: 5 * 1024 * 1024,
    maxTotalSize: 50 * 1024 * 1024,
    maxFileCount: 500,
    always: ['README.md'],
    withGitStatus: true,
    includeContent: true,
    dedupe: true,
    sort: 'size',
    config: config,
    onProgress: (progress) => {
      console.log(`${progress.percent}% - ${progress.message}`);
    },
    progressThrottleMs: 200,

    // From FormatOptions
    format: 'json',
    onlyTree: false,
    addLineNumbers: true,
    // No `basePath`: it is `copy()`'s first argument, and the option was
    // unconditionally overwritten.
    instructions: 'Code review',
    showSize: true,
    prettyPrint: true,

    // From CopyOptions
    output: './output.json',
    display: false,
    clipboard: false,
    stream: false,
    // `secretsReport`, `info` and `verbose` were declared here and never
    // implemented by `copy()`. They are CLI concerns and live only on the CLI.
    dryRun: false,
    charLimit: 10000,
    withLineNumbers: true,
  };
  const fullResult: CopyResult = await copy('./src', options);

  // Check optional stats
  if (result.stats.secretsGuard) {
    const findings: number = result.stats.secretsGuard.findings;
    const redacted: number = result.stats.secretsGuard.redacted;
    const excludedSecretFiles: number = result.stats.secretsGuard.excludedSecretFiles;
    const planOnly: boolean = result.stats.secretsGuard.planOnly;
    const scanner: 'gitleaks' | 'builtin' | 'none' = result.stats.secretsGuard.scanner;
    // Findings never carry the matched credential, only its identity.
    const fingerprint: string | null = result.stats.secretsGuard.report.findings[0]?.fingerprint;
  }

  if (result.stats.scanErrors) {
    const errors: string[] = result.stats.scanErrors;
  }

  if (result.stats.clipboardError) {
    const clipboardError: string = result.stats.clipboardError;
  }

  if (result.stats.dryRun) {
    const isDryRun: boolean = result.stats.dryRun;
  }
}

// Note: Streaming API tests removed - copyStream/formatStream not yet implemented

// ============================================================================
// Combined Usage Example
// ============================================================================

async function testCombinedUsage() {
  // Create isolated config
  const config = await ConfigManager.create();

  // Copy with progress tracking and config injection
  const result = await copy('./src', {
    config,
    format: 'json',
    onProgress: (progress: ProgressEvent) => {
      console.log(`${progress.percent}% - ${progress.message}`);
      if (progress.stage) {
        console.log(`  Stage: ${progress.stage}`);
      }
      if (progress.completed !== undefined && progress.total !== undefined) {
        console.log(`  Files: ${progress.completed}/${progress.total}`);
      }
    },
  });

  // Type check the result
  const outputString: string = result.output;
  const fileCount: number = result.stats.totalFiles;
}

// ============================================================================
// Daintree requirements: scope, budgets, accounting, outcomes
// ============================================================================

async function testScopedCopy() {
  // Literal paths, not globs: nothing for the caller to escape.
  const result = await copy('/repo', {
    scope: ['src/panels/[draft]', 'package.json'],
    filter: ['**/*.ts'],
  });

  const version: string | null = result.outputFormatVersion;
  const scoped: string[] | undefined = result.stats.scope;

  // Scope entries can also be resolved directly, from the advanced subpath.
  const { resolveScope } = await import('copytree/experimental');
  const entries = await resolveScope('/repo', ['src']);
  const abs: string = entries[0].absolutePath;
  const rel: string = entries[0].relativePath;
  const isDir: boolean = entries[0].isDirectory;

  return { version, scoped, abs, rel, isDir };
}

async function testBudgetsAndAccounting() {
  const result = await copy('/repo', {
    sizeGate: 128 * 1024,
    maxTotalSize: 2_000_000,
    maxFileCount: 500,
    charLimit: 400_000,
    explain: true,
  });

  const truncated: boolean | undefined = result.stats.truncated;
  const by: 'maxFileCount' | 'maxTotalSize' | 'charLimit' | undefined = result.stats.truncatedBy;

  const excluded: ExclusionSummary = result.stats.excluded;
  const total: number = excluded.total;
  const gated: number | undefined = excluded.byReason.sizeGate;
  const largest: ExclusionDetail[] | undefined = excluded.largest;

  // Reasons are machine-readable keys, rendered by a switch.
  const reason: ExclusionReason = EXCLUSION_REASONS.SIZE_GATE;

  // Emptiness is an outcome, not an error.
  const empty: boolean = result.stats.noFilesMatched;

  return { truncated, by, total, gated, largest, reason, empty };
}

async function testManifestOutcomes() {
  const { manifest, stats } = await copy('/repo', { dryRun: true });

  for (const entry of manifest) {
    const outcome: ManifestOutcome = entry.outcome;
    if (outcome === 'structure-only' || outcome === 'binary-placeholder') {
      continue;
    }
  }

  const chars: number = stats.estimatedOutputChars;
  const tokens: number = stats.estimatedTokens;
  const roughly: number = estimateTokens(chars);

  return { chars, tokens, roughly };
}

async function testStreamingParity() {
  let final: { manifest: ManifestEntry[]; stats: CopyResult['stats'] } | undefined;

  for await (const chunk of copyStream('/repo', {
    scope: ['src'],
    maxTotalSize: 1_000_000,
    onSummary: (summary: ScanSummary) => {
      const n: number = summary.totalFiles;
      return n;
    },
    onComplete: (result) => {
      final = result;
    },
  })) {
    const text: string = chunk;
    if (text.length === 0) break;
  }

  return final;
}

async function testHermeticConfig() {
  // Skip ~/.copytree entirely: same inputs, same context, every machine.
  const cfg = await ConfigManager.create({ userConfig: false, strict: true });

  if (!cfg.isDefaultsLoaded) {
    const errors = cfg.getLoadErrors();
    throw new Error(`config failed: ${errors.map((e) => e.scope).join(', ')}`);
  }

  return copy('/repo', { config: cfg });
}

async function testTypedErrors() {
  try {
    await copy('/repo', { scope: ['../elsewhere'] });
  } catch (error) {
    const code = (error as { code?: ErrorCode }).code;
    switch (code) {
      case 'ERR_SCOPE_OUTSIDE_ROOT':
      case 'ERR_PATH_NOT_FOUND':
      case 'ERR_ABORTED':
        return code;
      default:
        throw error;
    }
  }
  return undefined;
}
