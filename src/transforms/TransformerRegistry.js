import { TransformError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Extensions that a non-default transformer in `createDefault()` claims.
 *
 * Empty, because `createDefault()` registers nothing: there is no content-to-
 * content transformer in this release. `TransformStage` reads this to answer
 * "is there anything here to transform?" without building the registry, which
 * means importing every transformer module, constructing the cache service and
 * walking the traits scheduler. On an ordinary source-code copy the answer was
 * always no; it was `.zip` and `.docx` — claimed by a transformer that returns
 * `null` for both — that made the run pay for the whole subsystem to discover
 * it.
 *
 * `transformerCandidateExtensions.test.js` asserts this stays in step with what
 * `createDefault()` actually registers, so adding a transformer that claims a
 * new extension fails the suite rather than silently never running.
 *
 * @type {ReadonlySet<string>}
 */
export const CANDIDATE_EXTENSIONS = Object.freeze(new Set());

/**
 * Registry for file transformers
 * Manages transformer registration and selection based on file type
 * Includes traits-based validation and optimization
 */
class TransformerRegistry {
  /**
   * Create a new TransformerRegistry
   * @param {Object} [options] - Options for registry creation
   * @param {ConfigManager} [options.config] - ConfigManager instance for isolated configuration.
   */
  constructor(options = {}) {
    this.transformers = new Map();
    this.extensionMap = new Map();
    this.mimeTypeMap = new Map();
    this.defaultTransformer = null;
    this.logger = logger.child('TransformerRegistry');

    // Traits system
    this.traits = new Map(); // transformer name -> traits
    this.validationEnabled = true;

    // Store config for potential use by transformers
    this.config = options.config || null;
  }

  /**
   * Register a transformer
   * @param {string} name - Transformer name
   * @param {Object} transformer - Transformer instance or class
   * @param {Object} options - Registration options
   * @param {Object} traits - Transformer traits for validation and optimization
   */
  register(name, transformer, options = {}, traits = null) {
    if (this.transformers.has(name)) {
      this.logger.warn(`Overwriting existing transformer: ${name}`);
    }

    // Adopt the registry's configuration, unless the transformer brought its
    // own. A transformer constructed without one falls through to the
    // process-wide singleton and is isolated from nothing: an embedder running
    // two operations under different `ConfigManager` instances would have both
    // transform under whichever was installed globally. That used to be handled
    // by passing `{ config }` into each built-in transformer at construction;
    // with no built-ins left, the guarantee has to live where third-party
    // transformers actually arrive.
    //
    // Delegated to the transformer rather than assigned here, because adopting
    // a configuration means re-deriving what was read from the previous one —
    // which is the transformer's business, not the registry's.
    if (this.config && typeof transformer?.adoptConfig === 'function') {
      transformer.adoptConfig(this.config);
    }

    this.transformers.set(name, {
      transformer,
      options,
      priority: options.priority || 0,
    });

    // Register traits if provided
    if (traits) {
      this.traits.set(name, this._normalizeTraits(traits));
      this.logger.debug(`Registered traits for transformer: ${name}`, traits);
    }

    // Register extensions
    if (options.extensions) {
      options.extensions.forEach((ext) => {
        const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;
        if (!this.extensionMap.has(normalizedExt)) {
          this.extensionMap.set(normalizedExt, []);
        }
        this.extensionMap.get(normalizedExt).push(name);
      });
    }

    // Register MIME types
    if (options.mimeTypes) {
      options.mimeTypes.forEach((mimeType) => {
        if (!this.mimeTypeMap.has(mimeType)) {
          this.mimeTypeMap.set(mimeType, []);
        }
        this.mimeTypeMap.get(mimeType).push(name);
      });
    }

    // Set as default if specified
    if (options.isDefault) {
      this.defaultTransformer = name;
    }

    this.logger.debug(`Registered transformer: ${name}`);
  }

  /**
   * Get a transformer by name
   * @param {string} name - Transformer name
   * @returns {Object} Transformer instance
   */
  get(name) {
    const entry = this.transformers.get(name);
    if (!entry) {
      throw new TransformError(`Transformer not found: ${name}`, name);
    }
    return entry.transformer;
  }

  /**
   * Get transformer for a file
   * @param {Object} file - File object with path and optional mimeType
   * @returns {Object} Most appropriate transformer
   */
  getForFile(file) {
    const transformerNames = [];

    // Check by extension
    const ext = this.getExtension(file.path);
    if (ext && this.extensionMap.has(ext)) {
      transformerNames.push(...this.extensionMap.get(ext));
    }

    // Check by MIME type
    if (file.mimeType && this.mimeTypeMap.has(file.mimeType)) {
      transformerNames.push(...this.mimeTypeMap.get(file.mimeType));
    }

    // Get unique transformer names with highest priority
    const uniqueNames = [...new Set(transformerNames)];
    if (uniqueNames.length > 0) {
      const sorted = uniqueNames
        .map((name) => ({ name, ...this.transformers.get(name) }))
        .sort((a, b) => b.priority - a.priority);

      return this.get(sorted[0].name);
    }

    // Return default transformer
    if (this.defaultTransformer) {
      return this.get(this.defaultTransformer);
    }

    throw new TransformError(`No transformer found for file: ${file.path}`, 'unknown', file.path);
  }

  /**
   * Check if a transformer exists
   * @param {string} name - Transformer name
   * @returns {boolean}
   */
  has(name) {
    return this.transformers.has(name);
  }

  /**
   * List all registered transformers
   * @returns {Array} Array of transformer info
   */
  list() {
    return Array.from(this.transformers.entries()).map(([name, entry]) => ({
      name,
      priority: entry.priority,
      extensions: Array.from(this.extensionMap.entries())
        .filter(([_, names]) => names.includes(name))
        .map(([ext]) => ext),
      mimeTypes: Array.from(this.mimeTypeMap.entries())
        .filter(([_, names]) => names.includes(name))
        .map(([mime]) => mime),
      isDefault: this.defaultTransformer === name,
      traits: this.traits.get(name) || null,
    }));
  }

  /**
   * Get all transformer instances
   * @returns {Array} Array of transformer instances
   */
  getAllTransformers() {
    return Array.from(this.transformers.values()).map((entry) => entry.transformer);
  }

  /**
   * Clear all registered transformers
   */
  clear() {
    this.transformers.clear();
    this.extensionMap.clear();
    this.mimeTypeMap.clear();
    this.traits.clear();
    this.defaultTransformer = null;
  }

  /**
   * Validate transformer dependencies and detect circular dependencies
   * @returns {Array<string>} Topologically sorted transformer names
   * @throws {TransformError} If circular dependencies or missing dependencies are detected
   */
  validateDependencies() {
    const VISITING = 1;
    const DONE = 2;
    const state = new Map();
    const order = [];

    const getDeps = (name) => {
      const traits = this.traits.get(name);
      if (!traits || !traits.dependencies) {
        return [];
      }
      return Array.isArray(traits.dependencies) ? traits.dependencies : [];
    };

    const visit = (name, stack = []) => {
      const mark = state.get(name) || 0;

      if (mark === VISITING) {
        const cycle = [...stack, name].join(' -> ');
        throw new TransformError(`Circular dependency detected: ${cycle}`, 'CIRCULAR_DEPENDENCY');
      }

      if (mark === DONE) {
        return;
      }

      // Check if transformer exists
      if (!this.transformers.has(name)) {
        throw new TransformError(`Missing transformer dependency: ${name}`, 'MISSING_DEPENDENCY');
      }

      state.set(name, VISITING);
      stack.push(name);

      for (const dep of getDeps(name)) {
        // Dependencies can be external resources (like 'network')
        // Only validate dependencies that are registered transformers
        if (this.transformers.has(dep)) {
          visit(dep, stack);
        }
      }

      stack.pop();
      state.set(name, DONE);
      order.push(name);
    };

    // Visit all registered transformers
    for (const name of this.transformers.keys()) {
      if (!state.has(name) || state.get(name) === 0) {
        visit(name);
      }
    }

    return order;
  }

  /**
   * Validate a transformer execution plan
   * @param {Array<string>} stages - Array of transformer names in execution order
   * @returns {Object} Validation result with issues and warnings
   */
  validatePlan(stages) {
    if (!this.validationEnabled || !stages || stages.length === 0) {
      return { valid: true, issues: [], warnings: [] };
    }

    const issues = [];
    const warnings = [];

    // First, validate dependencies for circular references
    try {
      this.validateDependencies();
    } catch (error) {
      if (error.code === 'CIRCULAR_DEPENDENCY' || error.code === 'MISSING_DEPENDENCY') {
        issues.push({
          type: 'dependency_error',
          severity: 'error',
          message: error.message,
          transformers: stages,
        });
        return { valid: false, issues, warnings };
      }
      throw error;
    }

    // Check for conflicts between transformers
    for (let i = 0; i < stages.length; i++) {
      for (let j = i + 1; j < stages.length; j++) {
        const conflicts = this._checkConflicts(stages[i], stages[j]);
        issues.push(...conflicts);
      }
    }

    // Check ordering issues
    const orderingIssues = this._validateOrdering(stages);
    issues.push(...orderingIssues);

    // Check resource requirements
    const resourceIssues = this._validateResources(stages);
    issues.push(...resourceIssues);

    // Generate optimization warnings
    const optimizationWarnings = this._generateWarnings(stages);
    warnings.push(...optimizationWarnings);

    return {
      // Errors only. `issues` carries advisory entries too — a declared
      // resource requirement, an ordering note — and counting those made a
      // plan invalid for telling the caller something useful about it.
      valid: !issues.some((issue) => issue.severity === 'error'),
      issues,
      warnings,
    };
  }

  /**
   * Optimize a transformer execution plan
   * @param {Array<string>} stages - Array of transformer names
   * @returns {Object} Optimization result with suggested order and reasoning
   */
  optimizePlan(stages) {
    if (!stages || stages.length <= 1) {
      return {
        optimized: stages || [],
        changes: [],
        reasoning: [],
      };
    }

    const optimized = [...stages];
    const changes = [];
    const reasoning = [];

    // Sort by dependency requirements (order-sensitive transformers first)
    const withTraits = optimized.map((name) => ({
      name,
      traits: this.traits.get(name) || {},
    }));

    // Move order-sensitive transformers to appropriate positions
    const orderSensitive = withTraits.filter((t) => t.traits.orderSensitive);
    const orderInsensitive = withTraits.filter((t) => !t.traits.orderSensitive);
    const heavy = withTraits.filter((t) => t.traits.heavy);

    // Rebuild order: order-sensitive first, then light operations, then heavy operations
    const reordered = [
      ...orderSensitive.filter((t) => !t.traits.heavy),
      ...orderInsensitive.filter((t) => !t.traits.heavy),
      ...heavy,
    ];

    const optimizedNames = reordered.map((t) => t.name);

    // Track changes
    for (let i = 0; i < stages.length; i++) {
      if (stages[i] !== optimizedNames[i]) {
        changes.push({
          from: stages.indexOf(optimizedNames[i]),
          to: i,
          transformer: optimizedNames[i],
        });
      }
    }

    // Generate reasoning
    if (changes.length > 0) {
      reasoning.push('Reordered transformers for optimal execution:');
      reasoning.push('- Order-sensitive transformers moved to appropriate positions');
      reasoning.push('- Heavy operations moved to end to minimize impact');
    }

    return {
      optimized: optimizedNames,
      changes,
      reasoning,
    };
  }

  /**
   * Get traits for a specific transformer
   * @param {string} name - Transformer name
   * @returns {Object|null} Transformer traits or null if not found
   */
  getTraits(name) {
    return this.traits.get(name) || null;
  }

  /**
   * Enable or disable validation
   * @param {boolean} enabled - Whether validation should be enabled
   */
  setValidationEnabled(enabled) {
    this.validationEnabled = Boolean(enabled);
  }

  /**
   * Normalize and validate transformer traits
   * @private
   */
  _normalizeTraits(traits) {
    const normalized = {
      inputTypes: traits.inputTypes || ['text'],
      outputTypes: traits.outputTypes || ['text'],
      idempotent: traits.idempotent ?? true,
      orderSensitive: traits.orderSensitive ?? false,
      dependencies: traits.dependencies || [],
      heavy: traits.heavy ?? false,
      stateful: traits.stateful ?? false,
      conflictsWith: traits.conflictsWith || [],
      requirements: traits.requirements || {},
      tags: traits.tags || [],
    };

    // Validate trait values
    if (!Array.isArray(normalized.inputTypes)) {
      normalized.inputTypes = [normalized.inputTypes];
    }
    if (!Array.isArray(normalized.outputTypes)) {
      normalized.outputTypes = [normalized.outputTypes];
    }
    if (!Array.isArray(normalized.dependencies)) {
      normalized.dependencies = [normalized.dependencies];
    }
    if (!Array.isArray(normalized.conflictsWith)) {
      normalized.conflictsWith = [normalized.conflictsWith];
    }
    if (!Array.isArray(normalized.tags)) {
      normalized.tags = [normalized.tags];
    }

    return normalized;
  }

  /**
   * Check for conflicts between two transformers
   * @private
   */
  _checkConflicts(transformer1, transformer2) {
    const issues = [];
    const traits1 = this.traits.get(transformer1);
    const traits2 = this.traits.get(transformer2);

    if (!traits1 || !traits2) {
      return issues; // Skip validation if traits not available
    }

    // Check explicit conflicts
    if (traits1.conflictsWith.includes(transformer2)) {
      issues.push({
        type: 'conflict',
        severity: 'error',
        message: `Transformer '${transformer1}' conflicts with '${transformer2}'`,
        transformers: [transformer1, transformer2],
      });
    }

    if (traits2.conflictsWith.includes(transformer1)) {
      issues.push({
        type: 'conflict',
        severity: 'error',
        message: `Transformer '${transformer2}' conflicts with '${transformer1}'`,
        transformers: [transformer1, transformer2],
      });
    }

    // Check input/output type compatibility
    const hasCompatibleTypes = traits1.outputTypes.some((output) =>
      traits2.inputTypes.includes(output),
    );

    if (
      !hasCompatibleTypes &&
      traits1.outputTypes[0] !== 'any' &&
      traits2.inputTypes[0] !== 'any'
    ) {
      issues.push({
        type: 'incompatible_types',
        severity: 'warning',
        message: `Output types of '${transformer1}' (${traits1.outputTypes.join(', ')}) may not be compatible with input types of '${transformer2}' (${traits2.inputTypes.join(', ')})`,
        transformers: [transformer1, transformer2],
      });
    }

    return issues;
  }

  /**
   * Validate transformer ordering
   * @private
   */
  _validateOrdering(stages) {
    const issues = [];

    for (let i = 0; i < stages.length; i++) {
      const traits = this.traits.get(stages[i]);
      if (!traits) continue;

      // Check if order-sensitive transformer is placed appropriately
      if (traits.orderSensitive) {
        // Look for non-idempotent transformers before this one
        for (let j = 0; j < i; j++) {
          const prevTraits = this.traits.get(stages[j]);
          if (prevTraits && !prevTraits.idempotent) {
            issues.push({
              type: 'ordering',
              severity: 'warning',
              message: `Order-sensitive transformer '${stages[i]}' follows non-idempotent transformer '${stages[j]}', which may cause unpredictable results`,
              transformers: [stages[j], stages[i]],
            });
          }
        }
      }

      // Check if heavy transformer is placed optimally
      if (traits.heavy && i < stages.length - 2) {
        const remainingHeavy = stages.slice(i + 1).filter((name) => {
          const t = this.traits.get(name);
          return t && t.heavy;
        });

        if (remainingHeavy.length === 0) {
          issues.push({
            type: 'performance',
            severity: 'info',
            message: `Heavy transformer '${stages[i]}' could be moved later in the pipeline for better performance`,
            transformers: [stages[i]],
          });
        }
      }
    }

    return issues;
  }

  /**
   * Report the external resources a plan declares it needs.
   *
   * Reporting, not verifying. The distinction was collapsed: an `apiKey`
   * requirement produced `severity: 'error'` reading "requires an API key but
   * none is configured" without ever looking for one, so a correctly
   * configured transformer failed validation and an unconfigured one failed it
   * for the wrong reason. The `network` requirement was an empty block with a
   * comment saying a check could go here.
   *
   * A registry cannot check these. Whether an API key is present is a question
   * about a transformer's own configuration, which only the transformer can
   * answer; whether the network is reachable is not answerable in advance at
   * all. So this states what the plan will need, at `info`, and the transformer
   * raises a real error at the point it actually needs the thing and finds it
   * missing.
   *
   * @param {string[]} stages - Transformer names in execution order
   * @returns {Object[]} Advisory issues
   * @private
   */
  _validateResources(stages) {
    const issues = [];

    for (const stage of stages) {
      const traits = this.traits.get(stage);
      if (!traits) continue;

      const declared = Object.entries(traits.requirements ?? {})
        .filter(([, required]) => required)
        .map(([name]) => name);

      if (declared.length === 0) continue;

      issues.push({
        type: 'declared_requirement',
        severity: 'info',
        message: `Transformer '${stage}' declares that it needs ${declared.sort().join(', ')}`,
        transformers: [stage],
        requirements: declared.sort(),
      });
    }

    return issues;
  }

  /**
   * Generate optimization warnings
   * @private
   */
  _generateWarnings(stages) {
    const warnings = [];

    // Check for too many heavy operations
    const heavyCount = stages.filter((name) => {
      const traits = this.traits.get(name);
      return traits && traits.heavy;
    }).length;

    if (heavyCount > 3) {
      warnings.push({
        type: 'performance',
        severity: 'warning',
        message: `Pipeline contains ${heavyCount} heavy transformers, which may impact performance`,
        suggestion: 'Consider reducing the number of AI or computationally intensive transformers',
      });
    }

    // Check for redundant transformers
    const duplicateTags = new Map();
    stages.forEach((name) => {
      const traits = this.traits.get(name);
      if (traits && traits.tags) {
        traits.tags.forEach((tag) => {
          if (!duplicateTags.has(tag)) {
            duplicateTags.set(tag, []);
          }
          duplicateTags.get(tag).push(name);
        });
      }
    });

    for (const [tag, transformers] of duplicateTags) {
      if (transformers.length > 1 && ['summary', 'text-extraction'].includes(tag)) {
        warnings.push({
          type: 'redundancy',
          severity: 'info',
          message: `Multiple transformers with similar functionality detected: ${transformers.join(', ')} (tag: ${tag})`,
          suggestion: 'Consider using only one transformer per functional category',
        });
      }
    }

    return warnings;
  }

  /**
   * Get file extension
   * @private
   */
  getExtension(filePath) {
    const ext = filePath.match(/\.[^.]+$/);
    return ext ? ext[0].toLowerCase() : null;
  }

  /**
   * Create default registry with standard transformers and their traits
   * @static
   * @param {Object} [options] - Options for registry creation
   * @param {ConfigManager} [options.config] - ConfigManager instance for isolated configuration.
   *   If not provided, transformers will use their default configuration.
   *   This enables concurrent registry operations with different configurations.
   * @returns {Promise<TransformerRegistry>} Configured TransformerRegistry instance
   */
  static async createDefault(options = {}) {
    const registry = new TransformerRegistry();
    registry.config = options.config || null;

    // Nothing is registered. That is the honest state of the transform
    // subsystem, and stating it here is clearer than three registrations that
    // cannot do anything:
    //
    // - `file-loader` reloaded content `FileLoadingStage` had already read, so
    //   with content always present it returned its input untouched.
    // - `streaming-file-loader` did the same, having buffered the whole file
    //   despite its name.
    // - `binary` was registered for `.doc`, `.zip`, `.exe` and their kin, and
    //   its first act is to return `null` for any file that is not an image —
    //   so it was registered for exactly the extensions it refuses to handle.
    //   Worse than a no-op: `BaseTransformer.validateOutput()` rejects a null
    //   result, so every one of those files raised a `TransformError`, was
    //   marked `transformError`, counted in `transformErrors`, recorded as a
    //   degradation, and failed the run under `--strict`. Including a `.zip`
    //   was enough to make `copytree --strict` exit non-zero for no reason a
    //   user could act on. Its extension list is also what made
    //   `TransformStage` build this registry, the cache service and the traits
    //   scheduler for that `.zip` in the first place.
    //
    // Reading, binary classification and binary policy belong to
    // `FileLoadingStage`, which is where they actually happen. A content-to-
    // content converter — a real document transformer — registers here when
    // there is one; `copytree doctor` already reports that there is not.
    return registry;
  }
}

export default TransformerRegistry;
