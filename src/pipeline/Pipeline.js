const EventEmitter = require('events');
const { config } = require('../config/ConfigManager');

class Pipeline extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.stages = [];
    this.options = {
      continueOnError: options.continueOnError ?? config().get('pipeline.continueOnError', false),
      emitProgress: options.emitProgress ?? config().get('pipeline.emitProgress', true),
      parallel: options.parallel ?? false,
      maxConcurrency: options.maxConcurrency ?? config().get('app.maxConcurrency', 5),
      ...options,
    };
    
    this.stats = {
      startTime: null,
      endTime: null,
      stagesCompleted: 0,
      stagesFailed: 0,
      errors: [],
    };
  }

  /**
   * Add stages to the pipeline
   * @param {Array|Function} stages - Stage class(es) or function(s) to add
   * @returns {Pipeline} - Returns this for chaining
   */
  through(stages) {
    if (!Array.isArray(stages)) {
      stages = [stages];
    }
    
    this.stages.push(...stages);
    return this;
  }

  /**
   * Process input through all pipeline stages
   * @param {*} input - Initial input to process
   * @returns {Promise<*>} - Final processed output
   */
  async process(input) {
    this.stats.startTime = Date.now();
    this.stats.stagesCompleted = 0;
    this.stats.stagesFailed = 0;
    this.stats.errors = [];
    
    this.emit('pipeline:start', {
      input,
      stages: this.stages.length,
      options: this.options,
    });

    let result = input;

    try {
      if (this.options.parallel) {
        result = await this._processParallel(result);
      } else {
        result = await this._processSequential(result);
      }
      
      this.stats.endTime = Date.now();
      
      this.emit('pipeline:complete', {
        result,
        stats: this.getStats(),
      });
      
      return result;
    } catch (error) {
      this.stats.endTime = Date.now();
      
      this.emit('pipeline:error', {
        error,
        stats: this.getStats(),
      });
      
      throw error;
    }
  }

  /**
   * Process stages sequentially
   * @private
   */
  async _processSequential(input) {
    let result = input;
    
    for (let i = 0; i < this.stages.length; i++) {
      const Stage = this.stages[i];
      const stageName = this._getStageName(Stage, i);
      
      try {
        this.emit('stage:start', {
          stage: stageName,
          index: i,
          input: result,
        });
        
        // Determine what type of stage we have
        let stageInstance;
        
        if (typeof Stage === 'function' && !Stage.prototype) {
          // It's a plain function, use it directly
          stageInstance = Stage;
        } else if (typeof Stage === 'object' && Stage.process) {
          // It's already an instance with a process method
          stageInstance = Stage;
        } else {
          // It's a constructor, instantiate it with pipeline reference
          stageInstance = new Stage({ ...this.options, pipeline: this });
        }
          
        const processMethod = stageInstance.process || stageInstance;
        
        if (typeof processMethod !== 'function') {
          throw new Error(`Stage ${stageName} does not have a process method`);
        }
        
        result = await processMethod.call(stageInstance, result);
        
        this.stats.stagesCompleted++;
        
        this.emit('stage:complete', {
          stage: stageName,
          index: i,
          output: result,
        });
        
      } catch (error) {
        this.stats.stagesFailed++;
        this.stats.errors.push({
          stage: stageName,
          error: error.message,
          stack: error.stack,
        });
        
        this.emit('stage:error', {
          stage: stageName,
          index: i,
          error,
        });
        
        if (!this.options.continueOnError) {
          throw error;
        }
      }
    }
    
    return result;
  }

  /**
   * Process stages in parallel (when applicable)
   * @private
   */
  async _processParallel(input) {
    const chunks = Array.isArray(input) ? input : [input];
    const results = [];
    
    // Process chunks in batches
    for (let i = 0; i < chunks.length; i += this.options.maxConcurrency) {
      const batch = chunks.slice(i, i + this.options.maxConcurrency);
      
      const batchResults = await Promise.all(
        batch.map(async (chunk, _index) => {
          try {
            return await this._processSequential(chunk);
          } catch (error) {
            if (!this.options.continueOnError) {
              throw error;
            }
            return null;
          }
        }),
      );
      
      results.push(...batchResults);
    }
    
    return Array.isArray(input) ? results : results[0];
  }

  /**
   * Get stage name for logging
   * @private
   */
  _getStageName(Stage, index) {
    if (typeof Stage === 'string') return Stage;
    if (Stage.name) return Stage.name;
    if (Stage.constructor && Stage.constructor.name) return Stage.constructor.name;
    return `Stage${index + 1}`;
  }

  /**
   * Get pipeline statistics
   * @returns {Object} Pipeline stats
   */
  getStats() {
    return {
      ...this.stats,
      duration: this.stats.endTime ? this.stats.endTime - this.stats.startTime : (Date.now() - this.stats.startTime),
      successRate: (this.stats.stagesCompleted + this.stats.stagesFailed) > 0 
        ? this.stats.stagesCompleted / (this.stats.stagesCompleted + this.stats.stagesFailed)
        : 1,
    };
  }

  /**
   * Create a new pipeline instance
   * @static
   * @param {Object} options - Pipeline options
   * @returns {Pipeline} New pipeline instance
   */
  static create(options) {
    return new Pipeline(options);
  }

  /**
   * Send data through pipeline stages (Laravel-style)
   * @param {*} passable - Data to process
   * @returns {Object} Fluent interface
   */
  send(passable) {
    const self = this;
    return {
      through(stages) {
        self.through(stages);
        return {
          async then(callback) {
            const result = await self.process(passable);
            if (callback) {
              return callback(result);
            }
            return result;
          },
          async thenReturn() {
            return await self.process(passable);
          },
        };
      },
    };
  }
}

module.exports = Pipeline;