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
  scan,
  format,
  ConfigManager,
  ProgressEvent,
  ProgressCallback,
  CopyOptions,
  CopyResult,
  ScanOptions,
  FormatOptions,
  FileResult,
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
  const event: ProgressEvent = {
    percent: 50,
    message: 'Processing files...',
    stage: 'FileDiscoveryStage',
    filesProcessed: 100,
    totalFiles: 200,
    currentFile: 'src/index.ts',
    timestamp: Date.now(),
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
    const content: string | Buffer | null | undefined = file.content;
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
    transformers: ['markdown', 'csv'],
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
    transformers: ['markdown'],
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
    basePath: '/project',
    instructions: 'Code review',
    showSize: true,
    prettyPrint: true,

    // From CopyOptions
    output: './output.json',
    display: false,
    clipboard: false,
    stream: false,
    secretsReport: './secrets.json',
    info: true,
    dryRun: false,
    verbose: true,
    charLimit: 10000,
    withLineNumbers: true,
  };
  const fullResult: CopyResult = await copy('./src', options);

  // Check optional stats
  if (result.stats.secretsGuard) {
    const detected: number = result.stats.secretsGuard.detected;
    const redacted: number = result.stats.secretsGuard.redacted;
    const report: object | undefined = result.stats.secretsGuard.report;
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
      if (progress.filesProcessed !== undefined && progress.totalFiles !== undefined) {
        console.log(`  Files: ${progress.filesProcessed}/${progress.totalFiles}`);
      }
    },
  });

  // Type check the result
  const outputString: string = result.output;
  const fileCount: number = result.stats.totalFiles;
}
