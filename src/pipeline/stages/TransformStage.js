import Stage from '../Stage.js';
import { CacheService } from '../../services/CacheService.js';
import { generateTransformCacheKey } from '../../utils/fileHash.js';
import { ERROR_CODES, TransformError, isAbortError } from '../../utils/errors.js';
import { CANDIDATE_EXTENSIONS } from '../../transforms/TransformerRegistry.js';
import path from 'path';
import appConfig from '../../../config/app.js';

class TransformStage extends Stage {
  constructor(options = {}) {
    super(options);
    this.registry = options.registry;
    // A caller that has no registry yet passes a factory instead, so that
    // building one — which means importing every transformer module — happens
    // only for a run that turns out to need it.
    this.registryFactory = options.registryFactory || null;
    this.transformerConfig = options.transformers || {};
    this.maxConcurrency = options.maxConcurrency || appConfig.maxConcurrency || 5;
    this.noCache = options.noCache;
    // An explicit request for conversion (`--binary convert`) outranks the
    // heuristic that decides whether a registry is worth building.
    this.force = options.force === true;
    this.cacheEnabled = options.cacheEnabled ?? true;
    this._cache = options.cache ?? null;

    // Fatal at the stage level. Per-file transform failures are caught,
    // reported and degraded inside `transformFiles()`, which is where
    // resilience belongs; a failure that escapes that loop is structural — the
    // registry could not be built, the cache is broken, a batch flush threw —
    // and the old recovery answered it by silently skipping *every* requested
    // conversion and reporting success.
    //
    // Its `_isRecoverableError()` heuristic was also matched by substring, so
    // any error whose message merely mentioned `ETIMEDOUT` was treated as
    // recoverable regardless of what had actually gone wrong.
    this.fatal = true;
  }

  /**
   * The transformation cache, opened on first use.
   *
   * Constructing it eagerly meant every copy paid for a cache service that a
   * run without heavy transformers never reads from — and only heavy
   * transformers consult it.
   */
  get cache() {
    if (this.noCache) return null;
    if (!this._cache) {
      this._cache = CacheService.create('transformations', {
        enabled: this.cacheEnabled,
        defaultTtl: 86400, // 24 hours
      });
    }
    return this._cache;
  }

  async process(input) {
    const files = input.files || [];

    // Decide whether there is any work here before building anything. The
    // stage used to run unconditionally on the CLI path: for every file it
    // resolved the default transformer, built a cache key — a JSON.stringify
    // and a SHA-256 per file — and allocated a p-limit promise, all so that
    // `FileLoaderTransformer` could observe that the content was already
    // loaded and hand the file straight back.
    // A caller that handed over a built registry has already decided this stage
    // is wanted, and gets it. The skip applies to the factory form, where the
    // whole point is to avoid building one.
    if (!this.registry) {
      if (!this.registryFactory || (!this.force && !this.hasWorkToDo(files))) {
        this.log('No files require transformation, skipping', 'debug');
        return input;
      }
      this.registry = await this.registryFactory();
    }

    this.log(`Transforming ${files.length} files`, 'debug');
    return this.transformFiles(input);
  }

  /**
   * Whether any file in the selection could be transformed.
   *
   * Deliberately conservative: an explicitly configured transformer, a file the
   * loader flagged as convertible, or an extension a non-default transformer
   * claims all count. Anything unrecognised runs the stage.
   *
   * @param {Object[]} files - Selected files
   * @returns {boolean} True when the stage has something to do
   */
  hasWorkToDo(files) {
    // An explicit `transformers:` block in a profile is a request, and it can
    // name transformers this stage cannot see from extensions alone.
    if (Object.values(this.transformerConfig).some((entry) => entry?.enabled !== false)) {
      return true;
    }

    return files.some((file) => {
      if (!file) return false;
      if (file.needsTransform) return true;
      if (file.content === undefined) return true;
      const match = file.path?.match(/\.[^.\\/]+$/);
      return match ? CANDIDATE_EXTENSIONS.has(match[0].toLowerCase()) : false;
    });
  }

  /**
   * Transform every file that has a transformer, reporting progress as counts.
   *
   * This stage used to draw its own multi-line display: clearing lines, moving
   * the cursor and writing filenames straight to stdout. A stage cannot own the
   * terminal — it collided with Ink and with the spinner, it wrote to the same
   * stream as `--display` and `--stream`, and it ignored `--no-color`,
   * `--quiet` and the log level entirely. It now emits what it knows and lets
   * the reporter decide whether to draw anything at all.
   */
  async transformFiles(input) {
    const { files } = input;
    const startTime = Date.now();
    let transformCount = 0;
    let errorCount = 0;

    // Import p-limit dynamically (v7+ uses default export)
    const { default: pLimit } = await import('p-limit');
    const limit = pLimit(this.maxConcurrency);

    // First pass: identify files that need transformation
    const filesToTransform = [];
    const cachedResults = new Map();
    let hasHeavyTransformers = false;

    for (const file of files) {
      const transformer = this.getTransformerForFile(file);
      if (!transformer) continue;

      const transformerName = transformer.constructor.name;
      const cacheKey = generateTransformCacheKey(
        file,
        transformerName,
        this.transformerConfig[transformerName],
      );

      // Only check cache for heavy transformers
      if (transformer.isHeavy && this.cache) {
        const cached = await this.cache.get(cacheKey);
        if (cached) {
          cachedResults.set(file, cached);
          if (cached.transformed) transformCount++;
          continue;
        }
      }

      filesToTransform.push({ file, transformer, cacheKey });
      // Check if any transformer is heavy
      if (transformer.isHeavy) {
        hasHeavyTransformers = true;
      }
    }

    // Progress is only worth reporting when there is something slow to wait
    // for. A run whose transformers are all cheap finishes before a reader
    // could read the label.
    const activeTransforms = filesToTransform.length;
    const reportProgress = hasHeavyTransformers && activeTransforms > 0;
    let activeFiles = [];
    let completedCount = 0;
    // Which files failed, not just how many. A count tells a caller something
    // went wrong; the paths tell them what to look at.
    const transformFailures = [];

    // Pre-index filesToTransform by file for O(1) lookup instead of O(n)
    const transformMap = new Map(filesToTransform.map((info) => [info.file, info]));

    /**
     * Report what is being converted, as data.
     *
     * `activeFiles` is included so a verbose renderer can list what is in
     * flight; a default renderer shows one line with the counts and ignores it.
     * Either way the decision belongs to whoever owns the terminal.
     */
    const reportTransformProgress = () => {
      this.emitProgress(
        Math.round((completedCount / activeTransforms) * 100),
        `Converting documents… ${completedCount}/${activeTransforms}`,
        {
          completed: completedCount,
          total: activeTransforms,
          item: activeFiles[0],
          activeFiles: activeFiles.slice(0, this.maxConcurrency),
        },
      );
    };

    // Process files with active transform display
    const transformPromises = files.map((file) =>
      limit(async () => {
        // Check if this file is cached
        if (cachedResults.has(file)) {
          return cachedResults.get(file);
        }

        // Find the transform info for this file using O(1) Map lookup
        const transformInfo = transformMap.get(file);
        if (!transformInfo) {
          return file; // No transformation needed
        }

        const { transformer, cacheKey } = transformInfo;
        const filename = path.basename(file.path);

        try {
          if (reportProgress) {
            activeFiles.push(filename);
            reportTransformProgress();
          }

          // Perform transformation
          const transformed = await transformer.transform(file);

          if (transformed) {
            if (transformed.transformed) {
              transformCount++;
            }

            // Cache the result only for heavy transformers
            if (transformer.isHeavy && this.cache) {
              await this.cache.set(cacheKey, transformed);
            }

            completedCount++;
            if (reportProgress) {
              activeFiles = activeFiles.filter((f) => f !== filename);
              reportTransformProgress();
            }

            return transformed;
          }

          return file;
        } catch (error) {
          if (isAbortError(error)) throw error;

          errorCount++;
          this.log(`Failed to transform ${file.path}: ${error.message}`, 'warn');

          if (reportProgress) {
            completedCount++;
            activeFiles = activeFiles.filter((f) => f !== filename);
            reportTransformProgress();
          }

          // The original file, not `[Transform error: ...]` in place of its
          // content. Substituting the error message destroyed the very content
          // the transform was supposed to improve, and did it in a form
          // indistinguishable from source text — so a failed conversion left
          // the export claiming a file whose body was an error string.
          //
          // Keeping the original is a degradation, and is recorded as one:
          // `transformErrors` and `transformFailures` reach the caller, and
          // `--strict` refuses the run.
          transformFailures.push({ path: file.path, message: error.message });
          return { ...file, transformed: false, transformError: error.message };
        }
      }),
    );

    if (reportProgress) {
      reportTransformProgress();
    }

    // Wait for all transformations to complete
    const transformedFiles = await Promise.all(transformPromises);

    // Flush any batch transformers
    if (this.registry) {
      const transformers = this.registry.getAllTransformers();
      for (const transformer of transformers) {
        if (typeof transformer.flush === 'function') {
          this.log(`Flushing batch transformer: ${transformer.constructor.name}`, 'debug');
          await transformer.flush();
        }
      }
    }

    this.log(
      `Transformed ${transformCount} files (${errorCount} errors) in ${this.getElapsedTime(startTime)}`,
      'info',
    );

    return {
      ...input,
      files: transformedFiles,
      stats: {
        ...input.stats,
        transformedCount: transformCount,
        transformErrors: errorCount,
        ...(transformFailures.length > 0
          ? {
              transformFailures,
              degradations: [
                ...(input.stats?.degradations || []),
                {
                  stage: this.name,
                  code: ERROR_CODES.TRANSFORM,
                  message:
                    `${transformFailures.length} ` +
                    `${transformFailures.length === 1 ? 'file' : 'files'} could not be ` +
                    `transformed and were emitted unchanged`,
                },
              ],
            }
          : {}),
      },
    };
  }

  getTransformerForFile(file) {
    if (!this.registry) {
      return null;
    }

    try {
      const transformer = this.registry.getForFile(file);

      // Check if transformer is enabled in config
      const transformerName = transformer.constructor.name;
      const config =
        this.transformerConfig[transformerName] ||
        this.transformerConfig[transformerName.toLowerCase()] ||
        this.transformerConfig[transformerName.replace(/Transformer$/, '').toLowerCase()];

      if (config && config.enabled === false) {
        return null;
      }

      // Set noCache option on transformer if specified
      if (this.noCache) {
        transformer.cacheEnabled = false;
      }

      return transformer;
    } catch (_error) {
      // No transformer found, return null
      return null;
    }
  }
}

export default TransformStage;
