const Stage = require('../Stage');
const { CacheService } = require('../../services/CacheService');
const { generateTransformCacheKey } = require('../../utils/fileHash');
const { Listr } = require('listr2');
const path = require('path');

class TransformStage extends Stage {
  constructor(options = {}) {
    super(options);
    this.registry = options.registry;
    this.transformerConfig = options.transformers || {};
    this.maxConcurrency = options.maxConcurrency || require('../../../config/app').maxConcurrency || 5;
    
    // Initialize cache for transformations
    this.cache = options.cache || CacheService.create('transformations', {
      enabled: options.cacheEnabled ?? true,
      defaultTtl: 86400 // 24 hours
    });
  }

  async process(input) {
    this.log(`Transforming ${input.files.length} files`, 'debug');

    // Check if a parent Listr task was passed in the input context
    // and if we have enough files to make the display worthwhile
    if (input.parentTask && input.files.length > 3) {
      // This will create the dynamic multi-line output
      return this.processWithListr(input);
    } else {
      // Fallback to the old method if not using Listr or for small file counts
      return this.processDefault(input);
    }
  }
  
  // The new method that uses Listr for rich output
  async processWithListr(input) {
    const { files, parentTask } = input;
    const startTime = Date.now();
    let transformCount = 0;
    let errorCount = 0;
    
    // First, filter files that actually need transformation
    const filesToTransform = [];
    const results = new Array(files.length);
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const transformer = this.getTransformerForFile(file);
      
      if (!transformer) {
        // No transformer needed, pass through
        results[i] = file;
        continue;
      }
      
      // Check cache
      const transformerName = transformer.constructor.name;
      const cacheKey = generateTransformCacheKey(file, transformerName, this.transformerConfig[transformerName]);
      const cached = await this.cache.get(cacheKey);
      
      if (cached) {
        // Already cached, no need to transform
        if (cached.transformed) {
          transformCount++;
        }
        results[i] = cached;
        continue;
      }
      
      // This file needs transformation
      filesToTransform.push({ file, index: i, transformer, cacheKey });
    }
    
    // Only show Listr if there are files to transform and it's worth showing
    if (filesToTransform.length > 0 && filesToTransform.length > 2) {
      // Create tasks only for files that need transformation
      const transformFileTasks = filesToTransform.map(({ file, index, transformer, cacheKey }) => ({
        title: path.basename(file.path),
        task: async (ctx, task) => {
          try {
            // Perform transformation
            const transformed = await transformer.transform(file);
            if (transformed) {
              if (transformed.transformed) {
                transformCount++;
              }
              
              // Cache the result
              await this.cache.set(cacheKey, transformed);
              results[index] = transformed;
            } else {
              results[index] = file;
            }
          } catch (error) {
            errorCount++;
            this.log(`Failed to transform ${file.path}: ${error.message}`, 'warn');
            
            results[index] = {
              ...file,
              content: `[Transform error: ${error.message}]`,
              error: error.message,
              transformed: false
            };
          }
        }
      }));

      // Create a new Listr instance for the subtasks
      const subtasks = parentTask.newListr(transformFileTasks, {
        concurrent: this.maxConcurrency,
        exitOnError: false,
        rendererOptions: {
          showSubtasks: true,
          collapseSubtasks: false
        }
      });
      
      // Update parent task title
      parentTask.title = `Transforming ${filesToTransform.length} files`;
      
      // Run the subtasks
      await subtasks.run();
    } else if (filesToTransform.length > 0) {
      // For small numbers of files, transform without the display
      for (const { file, index, transformer, cacheKey } of filesToTransform) {
        try {
          const transformed = await transformer.transform(file);
          if (transformed) {
            if (transformed.transformed) {
              transformCount++;
            }
            await this.cache.set(cacheKey, transformed);
            results[index] = transformed;
          } else {
            results[index] = file;
          }
        } catch (error) {
          errorCount++;
          this.log(`Failed to transform ${file.path}: ${error.message}`, 'warn');
          results[index] = {
            ...file,
            content: `[Transform error: ${error.message}]`,
            error: error.message,
            transformed: false
          };
        }
      }
    }

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
      'info'
    );

    return {
      ...input,
      files: results.filter(Boolean), // Filter out any null results
      stats: {
        ...input.stats,
        transformedCount: transformCount,
        transformErrors: errorCount
      }
    };
  }
  
  // Original processing logic as a fallback
  async processDefault(input) {
    const startTime = Date.now();
    let transformCount = 0;
    let errorCount = 0;

    // Import p-limit dynamically to handle ES module
    let limit;
    try {
      const pLimit = (await import('p-limit')).default;
      limit = pLimit(this.maxConcurrency);
    } catch (error) {
      // Fallback to older p-limit version syntax
      const pLimit = require('p-limit');
      limit = pLimit.default ? pLimit.default(this.maxConcurrency) : pLimit(this.maxConcurrency);
    }

    // Process files in parallel with concurrency limit
    const transformPromises = input.files.map(file => 
      limit(async () => {
        try {
          // Check if transformers are configured for this file
          const transformer = this.getTransformerForFile(file);
          
          if (transformer) {
            // Generate cache key based on file content and transformer
            const transformerName = transformer.constructor.name;
            const cacheKey = generateTransformCacheKey(file, transformerName, this.transformerConfig[transformerName]);
            
            // Try to get from cache
            const cached = await this.cache.get(cacheKey);
            if (cached) {
              this.log(`Cache hit for ${file.path} (${transformerName})`, 'debug');
              if (cached.transformed) {
                transformCount++;
              }
              return cached;
            }
            
            // Not in cache, perform transformation
            const transformed = await transformer.transform(file);
            if (transformed) {
              if (transformed.transformed) {
                transformCount++;
              }
              
              // Cache the result
              await this.cache.set(cacheKey, transformed);
              
              return transformed;
            }
          }
          
          // No transformer or transformation failed, pass through
          return file;
        } catch (error) {
          errorCount++;
          this.log(`Failed to transform ${file.path}: ${error.message}`, 'warn');
          
          // Include file with error marker
          return {
            ...file,
            content: `[Transform error: ${error.message}]`,
            error: error.message,
            transformed: false
          };
        }
      })
    );

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
      'info'
    );

    return {
      ...input,
      files: transformedFiles,
      stats: {
        ...input.stats,
        transformedCount: transformCount,
        transformErrors: errorCount
      }
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
      const config = this.transformerConfig[transformerName] || 
                    this.transformerConfig[transformerName.toLowerCase()] ||
                    this.transformerConfig[transformerName.replace(/Transformer$/, '').toLowerCase()];
      
      if (config && config.enabled === false) {
        return null;
      }
      
      return transformer;
    } catch (error) {
      // No transformer found, return null
      return null;
    }
  }
}

module.exports = TransformStage;