import Pipeline from '../pipeline/Pipeline.js';
import { ValidationError } from '../utils/errors.js';
import { ConfigManager } from '../config/ConfigManager.js';
import FolderProfileLoader from '../config/FolderProfileLoader.js';
import path from 'path';
import fs from 'fs-extra';

/**
 * @typedef {Object} FileResult
 * @property {string} path - POSIX-style relative path
 * @property {string} absolutePath - Platform-specific absolute path
 * @property {number} size - File size in bytes
 * @property {Date} modified - Last modified timestamp
 * @property {string} [content] - File content (if includeContent is true)
 * @property {boolean} isBinary - Whether file is binary
 * @property {string} [encoding] - Character encoding (for text files)
 * @property {Object} [gitStatus] - Git status information (if withGitStatus is true)
 */

/**
 * @typedef {Object} ScanOptions
 * @property {string[]} [filter] - Additional include patterns
 * @property {string[]} [exclude] - Additional exclude patterns
 * @property {boolean} [respectGitignore=true] - Use .gitignore rules
 * @property {boolean} [modified=false] - Only git modified files
 * @property {string} [changed] - Files changed since git ref
 * @property {number} [maxDepth] - Maximum directory depth
 * @property {boolean} [transform=false] - Apply transformers
 * @property {string[]} [transformers] - Specific transformers to use
 * @property {boolean} [includeHidden=false] - Include hidden files
 * @property {boolean} [followSymlinks=false] - Follow symbolic links
 * @property {number} [maxFileSize] - Maximum file size in bytes
 * @property {number} [maxTotalSize] - Maximum total size in bytes
 * @property {number} [maxFileCount] - Maximum number of files
 * @property {string[]} [always] - Patterns to force include
 * @property {AbortSignal} [signal] - AbortSignal for cancellation
 * @property {Function} [onEvent] - Event callback function
 * @property {boolean} [withGitStatus=false] - Include git status information
 * @property {boolean} [includeContent=true] - Include file content in results
 * @property {boolean} [dedupe=false] - Remove duplicate files
 * @property {string} [sort] - Sort order: 'path', 'size', 'modified', 'name', 'extension'
 * @property {ConfigManager} [config] - ConfigManager instance for isolated configuration.
 *   If not provided, an isolated instance will be created. This enables concurrent
 *   scan operations with different configurations.
 */

/**
 * Scan a directory and return an async iterable of FileResult objects.
 * Files are yielded as soon as they are discovered and processed, enabling
 * streaming processing with bounded memory usage.
 *
 * @param {string} basePath - Path to directory to scan
 * @param {ScanOptions} [options={}] - Scan options
 * @returns {AsyncIterable<FileResult>} Async iterable of file results
 * @throws {ValidationError} If basePath is invalid or doesn't exist
 * @throws {Error} If scan is aborted via signal
 *
 * @example
 * // Basic scan
 * for await (const file of scan('./src')) {
 *   console.log(file.path, file.size);
 * }
 *
 * @example
 * // Scan with options
 * const files = scan('./src', {
 *   filter: ['**\/*.js'],
 *   exclude: ['**\/*.test.js'],
 *   transform: true,
 *   modified: true
 * });
 *
 * @example
 * // With cancellation
 * const controller = new AbortController();
 * setTimeout(() => controller.abort(), 5000);
 *
 * try {
 *   for await (const file of scan('./large-project', {
 *     signal: controller.signal
 *   })) {
 *     process(file);
 *   }
 * } catch (error) {
 *   if (error.name === 'AbortError') {
 *     console.log('Scan cancelled');
 *   }
 * }
 */
export async function* scan(basePath, options = {}) {
  // Guard against null options
  options = options ?? {};

  // Validate basePath
  if (!basePath || typeof basePath !== 'string') {
    throw new ValidationError('basePath must be a non-empty string', 'scan', basePath);
  }

  // Resolve and validate path
  const resolvedPath = path.resolve(basePath);
  if (!(await fs.pathExists(resolvedPath))) {
    throw new ValidationError(`Path does not exist: ${resolvedPath}`, 'scan', basePath);
  }

  // Check for abort signal
  if (options.signal?.aborted) {
    const error = new Error('Scan aborted');
    error.name = 'AbortError';
    throw error;
  }

  // 1. Load Folder Profile (Fix: Use FolderProfileLoader with basePath)
  const loader = new FolderProfileLoader({ cwd: resolvedPath });
  let folderProfile = null;

  // If a specific profile name is passed in options, load it; otherwise auto-discover
  try {
    if (options.profile) {
      folderProfile = await loader.loadNamed(options.profile);
    } else {
      folderProfile = await loader.discover();
    }
  } catch (e) {
    // If explicit profile failed, throw. If auto-discovery failed, ignore.
    if (options.profile) throw e;
  }

  // Create or use provided config instance for isolation
  const configInstance = options.config || (await ConfigManager.create());

  // Build configuration from options and config defaults
  const copytreeConfig = configInstance.get('copytree', {});

  // 2. Build Profile Config (Merging Logic)
  // Precedence: Options (API) > Folder Profile (.copytree.yml) > Global Defaults

  // Helper to ensure array
  const toArray = (val) => (Array.isArray(val) ? val : val ? [val] : []);

  const profile = {
    // Include patterns
    include: options.filter
      ? toArray(options.filter)
      : folderProfile?.include?.length > 0
        ? folderProfile.include
        : ['**/*'],

    // Exclude patterns - FIX: Merge all sources instead of overriding
    exclude: [
      ...toArray(options.exclude),
      ...(folderProfile?.exclude || []),
      ...(copytreeConfig.globalExcludedDirectories || []),
    ],

    // Filter patterns
    filter: options.filter
      ? Array.isArray(options.filter)
        ? options.filter
        : [options.filter]
      : [],

    // Force-include patterns
    always: [...toArray(options.always), ...toArray(folderProfile?.always)],

    // Options merging
    options: {
      respectGitignore:
        options.respectGitignore ??
        folderProfile?.options?.respectGitignore ??
        copytreeConfig.respectGitignore ??
        true,
      includeHidden:
        options.includeHidden ??
        folderProfile?.options?.includeHidden ??
        copytreeConfig.includeHidden ??
        false,
      followSymlinks:
        options.followSymlinks ??
        folderProfile?.options?.followSymlinks ??
        copytreeConfig.followSymlinks ??
        false,
      maxFileSize:
        options.maxFileSize ?? folderProfile?.options?.maxFileSize ?? copytreeConfig.maxFileSize,
      maxTotalSize:
        options.maxTotalSize ?? folderProfile?.options?.maxTotalSize ?? copytreeConfig.maxTotalSize,
      maxFileCount:
        options.maxFileCount ?? folderProfile?.options?.maxFileCount ?? copytreeConfig.maxFileCount,
    },
  };

  // Create pipeline with stages and pass config instance for isolation
  const pipeline = new Pipeline({
    continueOnError: true,
    emitProgress: Boolean(options.onEvent),
    config: configInstance,
  });

  // Setup stages
  const stages = [];

  // Merge force-include patterns
  const mergedAlways = [
    ...(Array.isArray(options.always) ? options.always : options.always ? [options.always] : []),
    ...(Array.isArray(profile.always) ? profile.always : []),
  ];

  // 1. File Discovery Stage
  const { default: FileDiscoveryStage } = await import('../pipeline/stages/FileDiscoveryStage.js');
  stages.push(
    new FileDiscoveryStage({
      basePath: resolvedPath,
      patterns: profile.include || ['**/*'],
      excludes: profile.exclude || [],
      respectGitignore: profile.options?.respectGitignore ?? true,
      includeHidden: profile.options?.includeHidden ?? false,
      followSymlinks: profile.options?.followSymlinks ?? false,
      maxFileSize: profile.options?.maxFileSize,
      maxTotalSize: profile.options?.maxTotalSize,
      maxFileCount: profile.options?.maxFileCount,
      forceInclude: mergedAlways,
    }),
  );

  // 2. Always Include Stage
  if (mergedAlways.length > 0) {
    const { default: AlwaysIncludeStage } = await import(
      '../pipeline/stages/AlwaysIncludeStage.js'
    );
    stages.push(new AlwaysIncludeStage(mergedAlways));
  }

  // 3. Git Filter Stage
  if (options.modified || options.changed) {
    const { default: GitFilterStage } = await import('../pipeline/stages/GitFilterStage.js');
    stages.push(
      new GitFilterStage({
        basePath: resolvedPath,
        modified: options.modified,
        changed: options.changed,
        withGitStatus: options.withGitStatus,
      }),
    );
  }

  // 4. Profile Filter Stage
  const { default: ProfileFilterStage } = await import('../pipeline/stages/ProfileFilterStage.js');
  stages.push(
    new ProfileFilterStage({
      exclude: profile.exclude || [],
      filter: profile.filter || [],
    }),
  );

  // 5. Deduplicate Stage
  if (options.dedupe) {
    const { default: DeduplicateFilesStage } = await import(
      '../pipeline/stages/DeduplicateFilesStage.js'
    );
    stages.push(new DeduplicateFilesStage());
  }

  // 6. Sort Stage
  if (options.sort) {
    const { default: SortFilesStage } = await import('../pipeline/stages/SortFilesStage.js');
    stages.push(new SortFilesStage({ sortBy: options.sort }));
  }

  // 7. File Loading Stage (if includeContent is not explicitly false)
  if (options.includeContent !== false) {
    const { default: FileLoadingStage } = await import('../pipeline/stages/FileLoadingStage.js');
    stages.push(
      new FileLoadingStage({
        encoding: 'utf8',
      }),
    );

    // 8. Transform Stage (if requested)
    if (options.transform) {
      const { default: TransformStage } = await import('../pipeline/stages/TransformStage.js');
      const TransformerRegistry = (await import('../transforms/TransformerRegistry.js')).default;
      // Pass config to registry for isolation
      const registry = await TransformerRegistry.createDefault({ config: configInstance });

      stages.push(
        new TransformStage({
          registry,
          transformers: options.transformers,
          profile,
        }),
      );
    }
  }

  pipeline.through(stages);

  // Setup abort handler with cleanup
  let abortHandler = null;
  if (options.signal) {
    abortHandler = () => {
      const error = new Error('Scan aborted');
      error.name = 'AbortError';
      pipeline.emit('error', error);
    };
    options.signal.addEventListener('abort', abortHandler, { once: true });
  }

  // Setup event forwarding
  if (options.onEvent) {
    const events = [
      'stage:start',
      'stage:complete',
      'stage:error',
      'stage:recover',
      'stage:progress',
      'file:batch',
      'stage:log',
    ];

    for (const event of events) {
      pipeline.on(event, (data) => {
        options.onEvent({ type: event, data });
      });
    }
  }

  // Execute pipeline
  try {
    const result = await pipeline.process({
      basePath: resolvedPath,
      profile,
      options,
    });

    // Yield files in stable order
    const files = result.files || [];

    // Ensure stable sorting if no explicit sort was requested
    if (!options.sort) {
      files.sort((a, b) => {
        if (a === null || b === null) return 0;
        return a.path.localeCompare(b.path);
      });
    }

    for (const file of files) {
      if (file === null) continue;

      // Check abort signal before yielding
      if (options.signal?.aborted) {
        const error = new Error('Scan aborted');
        error.name = 'AbortError';
        throw error;
      }

      yield file;
    }
  } catch (error) {
    // Re-throw abort errors as-is
    if (error.name === 'AbortError') {
      throw error;
    }

    // Wrap other errors with context
    const scanError = new Error(`Scan failed: ${error.message}`);
    scanError.cause = error;
    throw scanError;
  } finally {
    // Clean up abort listener to prevent memory leak
    if (abortHandler && options.signal) {
      options.signal.removeEventListener('abort', abortHandler);
    }
  }
}

export default scan;
