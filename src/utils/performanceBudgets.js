/**
 * Performance budgets and telemetry utilities
 * Based on README.md performance targets:
 * - Process 10,000 files in < 30 seconds
 * - Memory usage < 500MB for large projects
 * - Support projects up to 100MB total size
 * - Stream files > 10MB without loading into memory
 */

import { formatBytes } from './performance.js';

// Performance budgets based on README.md targets
export const PERFORMANCE_BUDGETS = {
  // Total execution time budgets based on project size
  totalTime: {
    small: 5000, // < 5s for small projects (< 100 files)
    medium: 15000, // < 15s for medium projects (100-1000 files)
    large: 30000, // < 30s for large projects (1000-10000 files)
  },

  // Memory usage budgets
  memoryUsage: {
    max: 500 * 1024 * 1024, // 500MB max memory usage
    warning: 250 * 1024 * 1024, // 250MB warning threshold
  },

  // Individual stage time budgets
  stageTime: {
    warning: 10000, // Warn if any stage > 10s
    critical: 20000, // Critical if any stage > 20s
  },

  // File processing throughput targets
  fileProcessing: {
    target: 3000, // Target: 3000ms per 1000 files (3s per 1k files)
    warning: 5000, // Warning: 5000ms per 1000 files
  },

  // Project size budgets
  projectSize: {
    max: 100 * 1024 * 1024, // 100MB max project size
    warning: 50 * 1024 * 1024, // 50MB warning threshold
  },
};

/**
 * Determine project size category based on file count
 */
export function getProjectSizeCategory(fileCount) {
  if (fileCount < 100) return 'small';
  if (fileCount < 1000) return 'medium';
  return 'large';
}

/**
 * Calculate performance grade (A-F) based on budgets
 */
export function calculatePerformanceGrade(stats, duration, fileCount) {
  const sizeCategory = getProjectSizeCategory(fileCount);
  const timeBudget = PERFORMANCE_BUDGETS.totalTime[sizeCategory];
  const memoryBudget = PERFORMANCE_BUDGETS.memoryUsage.max;

  let score = 100; // Start with perfect score

  // Time performance scoring (40% weight)
  const timeRatio = duration / timeBudget;
  if (timeRatio > 2.0) {
    score -= 40; // F for time
  } else if (timeRatio > 1.5) {
    score -= 30; // D for time
  } else if (timeRatio > 1.2) {
    score -= 20; // C for time
  } else if (timeRatio > 1.0) {
    score -= 10; // B for time
  }
  // A for time if timeRatio <= 1.0

  // Memory performance scoring (30% weight)
  const currentMemory = getCurrentMemoryUsage(stats);
  const memoryRatio = currentMemory / memoryBudget;
  if (memoryRatio > 1.0) {
    score -= 30; // F for memory
  } else if (memoryRatio > 0.8) {
    score -= 20; // D for memory
  } else if (memoryRatio > 0.6) {
    score -= 15; // C for memory
  } else if (memoryRatio > 0.4) {
    score -= 10; // B for memory
  }
  // A for memory if memoryRatio <= 0.4

  // Stage efficiency scoring (20% weight)
  const slowStages = getSlowStages(stats);
  if (slowStages.critical.length > 0) {
    score -= 20; // F for stages
  } else if (slowStages.warning.length > 2) {
    score -= 15; // D for stages
  } else if (slowStages.warning.length > 1) {
    score -= 10; // C for stages
  } else if (slowStages.warning.length > 0) {
    score -= 5; // B for stages
  }
  // A for stages if no slow stages

  // Throughput scoring (10% weight)
  const throughput = calculateThroughput(duration, fileCount);
  const throughputRatio =
    throughput.timePerThousandFiles / PERFORMANCE_BUDGETS.fileProcessing.target;
  if (throughputRatio > 2.0) {
    score -= 10; // F for throughput
  } else if (throughputRatio > 1.5) {
    score -= 8; // D for throughput
  } else if (throughputRatio > 1.2) {
    score -= 5; // C for throughput
  } else if (throughputRatio > 1.0) {
    score -= 3; // B for throughput
  }
  // A for throughput if throughputRatio <= 1.0

  // Map score to grade
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Get color for performance grade
 */
export function getGradeColor(grade) {
  switch (grade) {
    case 'A':
      return 'green';
    case 'B':
      return 'cyan';
    case 'C':
      return 'yellow';
    case 'D':
      return 'magenta';
    case 'F':
      return 'red';
    default:
      return 'white';
  }
}

/**
 * Check for budget warnings and recommendations
 */
export function checkBudgetWarnings(stats, duration, fileCount) {
  const warnings = [];
  const sizeCategory = getProjectSizeCategory(fileCount);

  // Time budget warnings
  const timeBudget = PERFORMANCE_BUDGETS.totalTime[sizeCategory];
  if (duration > timeBudget) {
    const overage = Math.round(((duration - timeBudget) / 1000) * 10) / 10;
    warnings.push(`Execution time exceeded budget by ${overage}s`);
  }

  // Memory budget warnings
  const currentMemory = getCurrentMemoryUsage(stats);
  if (currentMemory > PERFORMANCE_BUDGETS.memoryUsage.max) {
    warnings.push(`Memory usage exceeded 500MB limit: ${formatBytes(currentMemory)}`);
  } else if (currentMemory > PERFORMANCE_BUDGETS.memoryUsage.warning) {
    warnings.push(`High memory usage detected: ${formatBytes(currentMemory)}`);
  }

  // Stage time warnings
  const slowStages = getSlowStages(stats);
  if (slowStages.critical.length > 0) {
    warnings.push(`Critical stage performance: ${slowStages.critical.join(', ')} took >20s`);
  }
  if (slowStages.warning.length > 0) {
    warnings.push(`Slow stages detected: ${slowStages.warning.join(', ')} took >10s`);
  }

  // Project size warnings
  if (stats.totalSize > PERFORMANCE_BUDGETS.projectSize.max) {
    warnings.push(`Project size exceeded 100MB limit: ${formatBytes(stats.totalSize)}`);
  } else if (stats.totalSize > PERFORMANCE_BUDGETS.projectSize.warning) {
    warnings.push(`Large project detected: ${formatBytes(stats.totalSize)}`);
  }

  // Throughput warnings
  const throughput = calculateThroughput(duration, fileCount);
  if (throughput.timePerThousandFiles > PERFORMANCE_BUDGETS.fileProcessing.warning) {
    warnings.push(
      `Low throughput: ${Math.round(throughput.timePerThousandFiles)}ms per 1000 files`,
    );
  }

  return warnings;
}

/**
 * Generate optimization recommendations
 */
export function generateRecommendations(stats, duration, fileCount) {
  const recommendations = [];
  const sizeCategory = getProjectSizeCategory(fileCount);
  const currentMemory = getCurrentMemoryUsage(stats);
  const slowStages = getSlowStages(stats);

  // Time-based recommendations
  const timeBudget = PERFORMANCE_BUDGETS.totalTime[sizeCategory];
  if (duration > timeBudget) {
    if (fileCount > 500) {
      // Lower threshold to catch more cases
      recommendations.push('Consider using --head limit for faster processing');
    }
    if (stats.filesTransformed && stats.filesTransformed > 50) {
      recommendations.push(
        'Multiple transformers detected - consider running sequentially with --max-concurrency 1',
      );
    }
    if (stats.perStageTimings) {
      const heavyStages = Object.entries(stats.perStageTimings)
        .filter(([, time]) => time > 5000)
        .map(([name]) => name);
      if (heavyStages.length > 0) {
        recommendations.push(
          `Heavy stages detected (${heavyStages.join(', ')}) - consider optimizing file patterns`,
        );
      }
    }
  }

  // Memory-based recommendations
  if (currentMemory > PERFORMANCE_BUDGETS.memoryUsage.warning) {
    recommendations.push(
      'Large memory usage detected - consider streaming mode or smaller batch sizes',
    );
    if (stats.totalSize > 10 * 1024 * 1024) {
      recommendations.push('Enable streaming for large files with COPYTREE_STREAMING=true');
    }
  }

  // Stage-specific recommendations
  if (slowStages.warning.length > 0 || slowStages.critical.length > 0) {
    const allSlowStages = [...slowStages.warning, ...slowStages.critical];

    if (allSlowStages.includes('FileTransformation')) {
      recommendations.push('Enable caching for transformations to improve repeated runs');
      recommendations.push('Consider reducing transformation complexity or file count');
    }

    if (allSlowStages.includes('FileDiscovery')) {
      recommendations.push('Optimize file patterns - exclude unnecessary directories');
      recommendations.push('Use .copytreeignore to exclude large directories');
    }

    if (allSlowStages.includes('GitFiltering')) {
      recommendations.push(
        'Git operations are slow - consider --no-git-ignore for better performance',
      );
    }
  }

  // Transformation caching recommendations
  if (stats.filesTransformed && stats.filesTransformed > 20) {
    recommendations.push('Consider transformation result caching with COPYTREE_CACHE_ENABLED=true');
  }

  // Throughput recommendations
  const throughput = calculateThroughput(duration, fileCount);
  if (throughput.filesPerSecond < 100 && fileCount > 500) {
    recommendations.push('Low file processing throughput - check for I/O bottlenecks');
  }

  // Size-based recommendations
  if (stats.totalSize > PERFORMANCE_BUDGETS.projectSize.warning) {
    recommendations.push('Large projects benefit from streaming and selective file inclusion');
  }

  return recommendations;
}

/**
 * Calculate throughput metrics
 */
export function calculateThroughput(duration, fileCount) {
  const durationInSeconds = duration / 1000;
  const filesPerSecond = fileCount / durationInSeconds;
  const timePerThousandFiles = (duration / fileCount) * 1000;

  return {
    filesPerSecond: Math.round(filesPerSecond * 100) / 100,
    timePerThousandFiles: Math.round(timePerThousandFiles),
    durationInSeconds: Math.round(durationInSeconds * 100) / 100,
  };
}

/**
 * Get current memory usage from stats
 */
function getCurrentMemoryUsage(stats) {
  // Try to get memory from stage metrics
  if (stats.perStageMetrics) {
    const memoryUsages = Object.values(stats.perStageMetrics)
      .map((metrics) => metrics.memoryUsage?.end?.heapUsed || 0)
      .filter((mem) => mem > 0);

    if (memoryUsages.length > 0) {
      return Math.max(...memoryUsages);
    }
  }

  // Fallback to current memory
  return process.memoryUsage().heapUsed;
}

/**
 * Identify slow stages
 */
function getSlowStages(stats) {
  const warning = [];
  const critical = [];

  if (stats.perStageTimings) {
    Object.entries(stats.perStageTimings).forEach(([stageName, timing]) => {
      if (timing > PERFORMANCE_BUDGETS.stageTime.critical) {
        critical.push(stageName);
      } else if (timing > PERFORMANCE_BUDGETS.stageTime.warning) {
        warning.push(stageName);
      }
    });
  }

  return { warning, critical };
}

/**
 * Generate performance summary for display
 */
export function generatePerformanceSummary(stats, duration, fileCount) {
  const grade = calculatePerformanceGrade(stats, duration, fileCount);
  const warnings = checkBudgetWarnings(stats, duration, fileCount);
  const recommendations = generateRecommendations(stats, duration, fileCount);
  const throughput = calculateThroughput(duration, fileCount);
  const sizeCategory = getProjectSizeCategory(fileCount);

  return {
    grade,
    gradeColor: getGradeColor(grade),
    sizeCategory,
    throughput,
    warnings,
    recommendations,
    budgets: {
      timeUsed: duration,
      timeBudget: PERFORMANCE_BUDGETS.totalTime[sizeCategory],
      timeRatio: duration / PERFORMANCE_BUDGETS.totalTime[sizeCategory],
      memoryUsed: getCurrentMemoryUsage(stats),
      memoryBudget: PERFORMANCE_BUDGETS.memoryUsage.max,
      memoryRatio: getCurrentMemoryUsage(stats) / PERFORMANCE_BUDGETS.memoryUsage.max,
    },
  };
}

/**
 * Format performance metrics for display
 */
export function formatPerformanceMetrics(summary) {
  const { budgets, throughput } = summary;

  return {
    timePerformance: {
      used: `${Math.round(budgets.timeUsed)}ms`,
      budget: `${budgets.timeBudget}ms`,
      ratio: `${Math.round(budgets.timeRatio * 100)}%`,
      color: budgets.timeRatio > 1.2 ? 'red' : budgets.timeRatio > 1.0 ? 'yellow' : 'green',
    },
    memoryPerformance: {
      used: formatBytes(budgets.memoryUsed),
      budget: formatBytes(budgets.memoryBudget),
      ratio: `${Math.round(budgets.memoryRatio * 100)}%`,
      color: budgets.memoryRatio > 0.8 ? 'red' : budgets.memoryRatio > 0.5 ? 'yellow' : 'green',
    },
    throughputPerformance: {
      filesPerSecond: `${throughput.filesPerSecond} files/s`,
      timePerThousandFiles: `${throughput.timePerThousandFiles}ms/1k files`,
      color:
        throughput.timePerThousandFiles > PERFORMANCE_BUDGETS.fileProcessing.warning
          ? 'red'
          : throughput.timePerThousandFiles > PERFORMANCE_BUDGETS.fileProcessing.target
            ? 'yellow'
            : 'green',
    },
  };
}

/**
 * Enhanced telemetry aggregation for performance insights
 */
export class PerformanceTelemetry {
  constructor() {
    this.sessionMetrics = [];
    this.aggregatedStats = null;
  }

  /**
   * Record a performance session
   */
  recordSession(stats, duration, fileCount, options = {}) {
    const session = {
      timestamp: new Date().toISOString(),
      stats,
      duration,
      fileCount,
      options,
      summary: generatePerformanceSummary(stats, duration, fileCount),
      systemInfo: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        memory: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
      },
    };

    this.sessionMetrics.push(session);
    this.updateAggregatedStats();

    return session;
  }

  /**
   * Update aggregated performance statistics
   */
  updateAggregatedStats() {
    if (this.sessionMetrics.length === 0) {
      this.aggregatedStats = null;
      return;
    }

    const sessions = this.sessionMetrics;
    const grades = sessions.map((s) => s.summary.grade);
    const durations = sessions.map((s) => s.duration);
    const fileCounts = sessions.map((s) => s.fileCount);
    const memoryUsages = sessions.map((s) => getCurrentMemoryUsage(s.stats));

    this.aggregatedStats = {
      totalSessions: sessions.length,
      averageDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      averageFileCount: fileCounts.reduce((sum, f) => sum + f, 0) / fileCounts.length,
      averageMemoryUsage: memoryUsages.reduce((sum, m) => sum + m, 0) / memoryUsages.length,
      gradeDistribution: {
        A: grades.filter((g) => g === 'A').length,
        B: grades.filter((g) => g === 'B').length,
        C: grades.filter((g) => g === 'C').length,
        D: grades.filter((g) => g === 'D').length,
        F: grades.filter((g) => g === 'F').length,
      },
      performanceTrends: this.calculatePerformanceTrends(),
      commonBottlenecks: this.identifyCommonBottlenecks(),
      optimizationOpportunities: this.identifyOptimizationOpportunities(),
    };
  }

  /**
   * Calculate performance trends over time
   */
  calculatePerformanceTrends() {
    if (this.sessionMetrics.length < 2) return null;

    const recentSessions = this.sessionMetrics.slice(-10); // Last 10 sessions
    const oldSessions = this.sessionMetrics.slice(0, Math.min(10, this.sessionMetrics.length - 10));

    if (oldSessions.length === 0) return null;

    const recentAvgDuration =
      recentSessions.reduce((sum, s) => sum + s.duration, 0) / recentSessions.length;
    const oldAvgDuration = oldSessions.reduce((sum, s) => sum + s.duration, 0) / oldSessions.length;

    const recentAvgMemory =
      recentSessions.reduce((sum, s) => sum + getCurrentMemoryUsage(s.stats), 0) /
      recentSessions.length;
    const oldAvgMemory =
      oldSessions.reduce((sum, s) => sum + getCurrentMemoryUsage(s.stats), 0) / oldSessions.length;

    return {
      durationTrend: recentAvgDuration < oldAvgDuration ? 'improving' : 'degrading',
      durationChange: Math.round(((recentAvgDuration - oldAvgDuration) / oldAvgDuration) * 100),
      memoryTrend: recentAvgMemory < oldAvgMemory ? 'improving' : 'degrading',
      memoryChange: Math.round(((recentAvgMemory - oldAvgMemory) / oldAvgMemory) * 100),
    };
  }

  /**
   * Identify common performance bottlenecks
   */
  identifyCommonBottlenecks() {
    const bottlenecks = {};

    this.sessionMetrics.forEach((session) => {
      if (session.stats.perStageTimings) {
        Object.entries(session.stats.perStageTimings).forEach(([stageName, timing]) => {
          if (timing > PERFORMANCE_BUDGETS.stageTime.warning) {
            if (!bottlenecks[stageName]) {
              bottlenecks[stageName] = { count: 0, totalTime: 0, maxTime: 0 };
            }
            bottlenecks[stageName].count++;
            bottlenecks[stageName].totalTime += timing;
            bottlenecks[stageName].maxTime = Math.max(bottlenecks[stageName].maxTime, timing);
          }
        });
      }
    });

    // Convert to sorted array
    return Object.entries(bottlenecks)
      .map(([stageName, data]) => ({
        stageName,
        frequency: data.count,
        averageTime: data.totalTime / data.count,
        maxTime: data.maxTime,
        severity: data.maxTime > PERFORMANCE_BUDGETS.stageTime.critical ? 'critical' : 'warning',
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5); // Top 5 bottlenecks
  }

  /**
   * Identify optimization opportunities based on patterns
   */
  identifyOptimizationOpportunities() {
    const opportunities = [];

    if (!this.aggregatedStats) return opportunities;

    if (
      this.aggregatedStats.gradeDistribution.D + this.aggregatedStats.gradeDistribution.F >
      this.aggregatedStats.totalSessions * 0.3
    ) {
      opportunities.push({
        type: 'overall_performance',
        severity: 'high',
        description: 'Overall performance is poor in >30% of sessions',
        recommendation: 'Review file inclusion patterns and enable streaming mode',
      });
    }

    if (this.aggregatedStats.averageMemoryUsage > PERFORMANCE_BUDGETS.memoryUsage.warning) {
      opportunities.push({
        type: 'memory_usage',
        severity: 'medium',
        description: 'Average memory usage is consistently high',
        recommendation: 'Enable streaming for large files and optimize batch sizes',
      });
    }

    const slowTransformations = this.aggregatedStats.commonBottlenecks.filter(
      (b) =>
        b.stageName === 'FileTransformation' &&
        b.frequency > this.aggregatedStats.totalSessions * 0.5,
    );

    if (slowTransformations.length > 0) {
      opportunities.push({
        type: 'transformation_performance',
        severity: 'medium',
        description: 'File transformations are frequently slow',
        recommendation: 'Enable transformation result caching and consider reducing transformation complexity',
      });
    }

    return opportunities;
  }

  /**
   * Generate performance insights report
   */
  generateInsightsReport() {
    if (!this.aggregatedStats) {
      return { error: 'No performance data available' };
    }

    const stats = this.aggregatedStats;
    const trends = stats.performanceTrends;

    return {
      summary: {
        totalSessions: stats.totalSessions,
        averageGrade: this.calculateAverageGrade(),
        performanceScore: this.calculateOverallPerformanceScore(),
        averageDuration: Math.round(stats.averageDuration),
        averageFileCount: Math.round(stats.averageFileCount),
        averageMemoryUsage: formatBytes(stats.averageMemoryUsage),
      },
      trends: trends
        ? {
            duration: `${trends.durationTrend} (${trends.durationChange > 0 ? '+' : ''}${trends.durationChange}%)`,
            memory: `${trends.memoryTrend} (${trends.memoryChange > 0 ? '+' : ''}${trends.memoryChange}%)`,
          }
        : null,
      topBottlenecks: stats.commonBottlenecks.slice(0, 3),
      keyOpportunities: stats.optimizationOpportunities.slice(0, 3),
      gradeDistribution: stats.gradeDistribution,
    };
  }

  /**
   * Calculate average grade as numeric value
   */
  calculateAverageGrade() {
    const gradeValues = { A: 4, B: 3, C: 2, D: 1, F: 0 };
    const distribution = this.aggregatedStats.gradeDistribution;

    const totalPoints = Object.entries(distribution).reduce(
      (sum, [grade, count]) => sum + gradeValues[grade] * count,
      0,
    );

    const totalSessions = Object.values(distribution).reduce((sum, count) => sum + count, 0);

    if (totalSessions === 0) return 'N/A';

    const averagePoints = totalPoints / totalSessions;
    const grades = ['F', 'D', 'C', 'B', 'A'];
    return grades[Math.round(averagePoints)];
  }

  /**
   * Calculate overall performance score (0-100)
   */
  calculateOverallPerformanceScore() {
    const distribution = this.aggregatedStats.gradeDistribution;
    const total = Object.values(distribution).reduce((sum, count) => sum + count, 0);

    if (total === 0) return 0;

    const score =
      (distribution.A * 100 +
        distribution.B * 80 +
        distribution.C * 60 +
        distribution.D * 40 +
        distribution.F * 0) /
      total;

    return Math.round(score);
  }

  /**
   * Clear telemetry data
   */
  clear() {
    this.sessionMetrics = [];
    this.aggregatedStats = null;
  }

  /**
   * Export telemetry data
   */
  export() {
    return {
      sessionMetrics: this.sessionMetrics,
      aggregatedStats: this.aggregatedStats,
      exportedAt: new Date().toISOString(),
    };
  }
}

/**
 * Global telemetry instance
 */
export const globalTelemetry = new PerformanceTelemetry();
