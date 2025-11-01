import { TransformError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Registry for file transformers
 * Manages transformer registration and selection based on file type
 * Includes traits-based validation and optimization
 */
class TransformerRegistry {
  constructor() {
    this.transformers = new Map();
    this.extensionMap = new Map();
    this.mimeTypeMap = new Map();
    this.defaultTransformer = null;
    this.logger = logger.child('TransformerRegistry');

    // Traits system
    this.traits = new Map(); // transformer name -> traits
    this.validationEnabled = true;
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
        // Dependencies can be external resources (like 'tesseract', 'network')
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
      valid: issues.length === 0,
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
   * Validate resource requirements
   * @private
   */
  _validateResources(stages) {
    const issues = [];
    const requiredResources = new Set();

    for (const stage of stages) {
      const traits = this.traits.get(stage);
      if (!traits) continue;

      // Check for required dependencies
      for (const dep of traits.dependencies) {
        requiredResources.add(dep);
      }

      // Check specific requirements
      if (traits.requirements.apiKey) {
        issues.push({
          type: 'missing_resource',
          severity: 'error',
          message: `Transformer '${stage}' requires an API key but none is configured`,
          transformers: [stage],
        });
      }

      if (traits.requirements.network) {
        // Could add network connectivity checks here
      }
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
   */
  static async createDefault() {
    const registry = new TransformerRegistry();

    // Register default transformers - using dynamic imports for better ESM compatibility
    const { default: FileLoaderTransformer } = await import(
      './transformers/FileLoaderTransformer.js'
    );
    const { default: MarkdownTransformer } = await import('./transformers/MarkdownTransformer.js');
    const { default: CSVTransformer } = await import('./transformers/CSVTransformer.js');
    const { default: BinaryTransformer } = await import('./transformers/BinaryTransformer.js');
    const { default: PDFTransformer } = await import('./transformers/PDFTransformer.js');
    const { default: ImageTransformer } = await import('./transformers/ImageTransformer.js');

    // File Loader - default transformer
    registry.register(
      'file-loader',
      new FileLoaderTransformer(),
      {
        isDefault: true,
        priority: 0,
      },
      {
        inputTypes: ['any'],
        outputTypes: ['text', 'binary'],
        idempotent: true,
        orderSensitive: false,
        heavy: false,
        stateful: false,
        dependencies: [],
        conflictsWith: [],
        requirements: {},
        tags: ['loader', 'default'],
      },
    );

    // Markdown transformer
    registry.register(
      'markdown',
      new MarkdownTransformer(),
      {
        extensions: [], // Must be explicitly enabled - not applied automatically
        priority: 10,
      },
      {
        inputTypes: ['text'],
        outputTypes: ['text'],
        idempotent: true,
        orderSensitive: false,
        heavy: false,
        stateful: false,
        dependencies: [],
        conflictsWith: [],
        requirements: {},
        tags: ['text-processing', 'markdown'],
      },
    );

    // CSV transformer
    registry.register(
      'csv',
      new CSVTransformer(),
      {
        extensions: [], // Must be explicitly enabled - not applied automatically
        mimeTypes: [], // Must be explicitly enabled - not applied automatically
        priority: 10,
      },
      {
        inputTypes: ['text'],
        outputTypes: ['text'],
        idempotent: true,
        orderSensitive: false,
        heavy: false,
        stateful: false,
        dependencies: [],
        conflictsWith: [],
        requirements: {},
        tags: ['data-processing', 'csv', 'formatting'],
      },
    );

    // PDF transformer
    registry.register(
      'pdf',
      new PDFTransformer(),
      {
        extensions: ['.pdf'],
        mimeTypes: ['application/pdf'],
        priority: 15,
      },
      {
        inputTypes: ['binary'],
        outputTypes: ['text'],
        idempotent: true,
        orderSensitive: false,
        heavy: true,
        stateful: false,
        dependencies: [],
        conflictsWith: [],
        requirements: {
          memory: '50MB',
        },
        tags: ['text-extraction', 'document', 'pdf'],
      },
    );

    // Image transformer (OCR)
    registry.register(
      'image',
      new ImageTransformer(),
      {
        extensions: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', '.webp'],
        mimeTypes: [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/bmp',
          'image/tiff',
          'image/webp',
        ],
        priority: 15,
      },
      {
        inputTypes: ['binary'],
        outputTypes: ['text'],
        idempotent: true,
        orderSensitive: false,
        heavy: true,
        stateful: false,
        dependencies: ['tesseract'],
        conflictsWith: [],
        requirements: {
          memory: '100MB',
        },
        tags: ['text-extraction', 'image', 'ocr'],
      },
    );

    // Binary transformer
    registry.register(
      'binary',
      new BinaryTransformer(),
      {
        extensions: [
          '.doc',
          '.docx',
          '.xls',
          '.xlsx',
          '.zip',
          '.tar',
          '.gz',
          '.rar',
          '.7z',
          '.exe',
          '.dll',
          '.so',
          '.dylib',
        ],
        priority: 5,
      },
      {
        inputTypes: ['binary'],
        outputTypes: ['text'],
        idempotent: true,
        orderSensitive: false,
        heavy: false,
        stateful: false,
        dependencies: [],
        conflictsWith: [],
        requirements: {},
        tags: ['binary-handler', 'placeholder'],
      },
    );

    return registry;
  }
}

export default TransformerRegistry;
