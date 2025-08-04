import { performance } from 'perf_hooks';
import { logger } from './logger.js';

/**
 * Performance monitoring utilities
 */
class PerformanceMonitor {
  constructor(options = {}) {
    this.options = {
      enabled: options.enabled ?? process.env.NODE_ENV !== 'production',
      logThreshold: options.logThreshold ?? 1000, // Log operations over 1s
      memoryThreshold: options.memoryThreshold ?? 50 * 1024 * 1024, // 50MB
      ...options,
    };
    
    this.timers = new Map();
    this.metrics = new Map();
    this.logger = logger.child('Performance');
  }

  /**
   * Start timing an operation
   */
  startTimer(name) {
    if (!this.options.enabled) return;
    
    this.timers.set(name, {
      startTime: performance.now(),
      startMemory: process.memoryUsage(),
    });
  }

  /**
   * End timing an operation and optionally log results
   */
  endTimer(name, metadata = {}) {
    if (!this.options.enabled) return null;
    
    const timer = this.timers.get(name);
    if (!timer) {
      this.logger.warn(`Timer '${name}' was not started`);
      return null;
    }

    const endTime = performance.now();
    const endMemory = process.memoryUsage();
    
    const duration = endTime - timer.startTime;
    const memoryDelta = {
      rss: endMemory.rss - timer.startMemory.rss,
      heapUsed: endMemory.heapUsed - timer.startMemory.heapUsed,
      heapTotal: endMemory.heapTotal - timer.startMemory.heapTotal,
    };

    const result = {
      name,
      duration: Math.round(duration * 100) / 100,
      memory: memoryDelta,
      metadata,
      timestamp: new Date().toISOString(),
    };

    // Store metric
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name).push(result);

    // Log if over threshold
    if (duration > this.options.logThreshold) {
      this.logger.warn('Slow operation detected', result);
    }

    // Log if high memory usage
    if (memoryDelta.heapUsed > this.options.memoryThreshold) {
      this.logger.warn('High memory usage detected', result);
    }

    this.timers.delete(name);
    return result;
  }

  /**
   * Measure a function execution
   */
  async measure(name, fn, metadata = {}) {
    this.startTimer(name);
    try {
      const result = await fn();
      return { result, performance: this.endTimer(name, metadata) };
    } catch (error) {
      this.endTimer(name, { ...metadata, error: error.message });
      throw error;
    }
  }

  /**
   * Measure a function and return only the result
   */
  async measureOnly(name, fn, metadata = {}) {
    const { result } = await this.measure(name, fn, metadata);
    return result;
  }

  /**
   * Get performance statistics for an operation
   */
  getStats(name) {
    const measurements = this.metrics.get(name);
    if (!measurements || measurements.length === 0) {
      return null;
    }

    const durations = measurements.map((m) => m.duration);
    const memoryUsages = measurements.map((m) => m.memory.heapUsed);

    return {
      name,
      count: measurements.length,
      duration: {
        min: Math.min(...durations),
        max: Math.max(...durations),
        avg: durations.reduce((sum, d) => sum + d, 0) / durations.length,
        total: durations.reduce((sum, d) => sum + d, 0),
      },
      memory: {
        min: Math.min(...memoryUsages),
        max: Math.max(...memoryUsages),
        avg: memoryUsages.reduce((sum, m) => sum + m, 0) / memoryUsages.length,
        total: memoryUsages.reduce((sum, m) => sum + m, 0),
      },
      measurements: measurements.slice(-10), // Last 10 measurements
    };
  }

  /**
   * Get all performance statistics
   */
  getAllStats() {
    const stats = {};
    for (const name of this.metrics.keys()) {
      stats[name] = this.getStats(name);
    }
    return stats;
  }

  /**
   * Clear performance data
   */
  clear(name = null) {
    if (name) {
      this.metrics.delete(name);
      this.timers.delete(name);
    } else {
      this.metrics.clear();
      this.timers.clear();
    }
  }

  /**
   * Create a scoped performance monitor
   */
  scope(prefix) {
    return {
      startTimer: (name) => this.startTimer(`${prefix}.${name}`),
      endTimer: (name, metadata) => this.endTimer(`${prefix}.${name}`, metadata),
      measure: (name, fn, metadata) => this.measure(`${prefix}.${name}`, fn, metadata),
      measureOnly: (name, fn, metadata) => this.measureOnly(`${prefix}.${name}`, fn, metadata),
    };
  }

  /**
   * Monitor system resources
   */
  getSystemStats() {
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();
    
    return {
      memory: {
        rss: memory.rss,
        heapTotal: memory.heapTotal,
        heapUsed: memory.heapUsed,
        external: memory.external,
        arrayBuffers: memory.arrayBuffers,
      },
      cpu: {
        user: cpu.user,
        system: cpu.system,
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Log current system stats
   */
  logSystemStats(context = '') {
    if (!this.options.enabled) return;
    
    const stats = this.getSystemStats();
    this.logger.debug('System stats', { context, ...stats });
  }
}

/**
 * Decorator for measuring class methods
 */
function measureMethod(target, propertyName, descriptor) {
  const originalMethod = descriptor.value;
  
  descriptor.value = async function(...args) {
    const monitor = new PerformanceMonitor();
    const className = this.constructor.name;
    const methodName = `${className}.${propertyName}`;
    
    return await monitor.measureOnly(methodName, () => originalMethod.apply(this, args));
  };
  
  return descriptor;
}

/**
 * Function wrapper for performance measurement
 */
function measureFunction(name, fn) {
  const monitor = new PerformanceMonitor();
  
  return async function(...args) {
    return await monitor.measureOnly(name, () => fn.apply(this, args));
  };
}

/**
 * Memory usage formatter
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  const sign = bytes < 0 ? '-' : '';
  return `${sign}${Math.round(value * 100) / 100} ${sizes[i]}`;
}

/**
 * Global performance monitor instance
 */
const globalMonitor = new PerformanceMonitor();

export {
  PerformanceMonitor,
  measureMethod,
  measureFunction,
  formatBytes,
  globalMonitor as monitor,
};