const Stage = require('../Stage');

class TransformStage extends Stage {
  constructor(options = {}) {
    super(options);
    this.registry = options.registry;
    this.transformerConfig = options.transformers || {};
  }

  async process(input) {
    this.log(`Transforming ${input.files.length} files`, 'debug');
    const startTime = Date.now();

    const transformedFiles = [];
    let transformCount = 0;
    let errorCount = 0;

    for (const file of input.files) {
      try {
        // Check if transformers are configured for this file
        const transformer = this.getTransformerForFile(file);
        
        if (transformer) {
          const transformed = await transformer.transform(file);
          if (transformed) {
            transformedFiles.push(transformed);
            if (transformed.transformed) {
              transformCount++;
            }
          }
        } else {
          // No transformer, pass through
          transformedFiles.push(file);
        }
      } catch (error) {
        errorCount++;
        this.log(`Failed to transform ${file.path}: ${error.message}`, 'warn');
        
        // Include file with error marker
        transformedFiles.push({
          ...file,
          content: `[Transform error: ${error.message}]`,
          error: error.message,
          transformed: false
        });
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