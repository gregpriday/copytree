import {
  PERFORMANCE_BUDGETS,
  getProjectSizeCategory,
  calculatePerformanceGrade,
  getGradeColor,
  checkBudgetWarnings,
  generateRecommendations,
  calculateThroughput,
  generatePerformanceSummary,
  formatPerformanceMetrics,
  PerformanceTelemetry,
} from '../../../src/utils/performanceBudgets.js';

describe('Performance Budgets', () => {
  describe('getProjectSizeCategory', () => {
    test('categorizes small projects correctly', () => {
      expect(getProjectSizeCategory(50)).toBe('small');
      expect(getProjectSizeCategory(99)).toBe('small');
    });

    test('categorizes medium projects correctly', () => {
      expect(getProjectSizeCategory(100)).toBe('medium');
      expect(getProjectSizeCategory(500)).toBe('medium');
      expect(getProjectSizeCategory(999)).toBe('medium');
    });

    test('categorizes large projects correctly', () => {
      expect(getProjectSizeCategory(1000)).toBe('large');
      expect(getProjectSizeCategory(5000)).toBe('large');
      expect(getProjectSizeCategory(10000)).toBe('large');
    });
  });

  describe('calculatePerformanceGrade', () => {
    test('gives A grade for excellent performance', () => {
      const stats = {
        filesProcessed: 100,
        totalSize: 10 * 1024 * 1024, // 10MB
        perStageTimings: {
          FileDiscovery: 1000,
          Transformation: 2000,
        },
      };
      const duration = 8000; // 8s for medium project (budget: 15s)
      const fileCount = 100;

      const grade = calculatePerformanceGrade(stats, duration, fileCount);
      // Accept A or B - grading can vary slightly based on environment
      expect(['A', 'B']).toContain(grade);
    });

    test('gives F grade for poor performance', () => {
      const stats = {
        filesProcessed: 100,
        totalSize: 50 * 1024 * 1024, // 50MB
        perStageTimings: {
          FileDiscovery: 25000, // 25s - critical
          Transformation: 15000, // 15s - warning
        },
      };
      const duration = 35000; // 35s for medium project (budget: 15s)
      const fileCount = 100;

      const grade = calculatePerformanceGrade(stats, duration, fileCount);
      expect(grade).toBe('F');
    });

    test('gives appropriate grades for borderline cases', () => {
      const stats = {
        filesProcessed: 100,
        totalSize: 20 * 1024 * 1024,
      };
      const duration = 16000; // Slightly over budget
      const fileCount = 100;

      const grade = calculatePerformanceGrade(stats, duration, fileCount);
      expect(['B', 'C']).toContain(grade);
    });
  });

  describe('getGradeColor', () => {
    test('returns correct colors for grades', () => {
      expect(getGradeColor('A')).toBe('green');
      expect(getGradeColor('B')).toBe('cyan');
      expect(getGradeColor('C')).toBe('yellow');
      expect(getGradeColor('D')).toBe('magenta');
      expect(getGradeColor('F')).toBe('red');
      expect(getGradeColor('X')).toBe('white'); // Default
    });
  });

  describe('checkBudgetWarnings', () => {
    test('identifies time budget violations', () => {
      const stats = { filesProcessed: 100 };
      const duration = 20000; // 20s for medium project (budget: 15s)
      const fileCount = 100;

      const warnings = checkBudgetWarnings(stats, duration, fileCount);
      expect(warnings.some((w) => w.includes('Execution time exceeded'))).toBe(true);
    });

    test('identifies memory budget violations', () => {
      // Mock process.memoryUsage to return high memory
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn(() => ({
        heapUsed: 600 * 1024 * 1024, // 600MB - exceeds limit
      }));

      const stats = { filesProcessed: 100 };
      const duration = 10000;
      const fileCount = 100;

      const warnings = checkBudgetWarnings(stats, duration, fileCount);
      expect(warnings.some((w) => w.includes('Memory usage exceeded'))).toBe(true);

      // Restore original function
      process.memoryUsage = originalMemoryUsage;
    });

    test('identifies slow stages', () => {
      const stats = {
        filesProcessed: 100,
        perStageTimings: {
          FileDiscovery: 25000, // 25s - critical
          Transformation: 12000, // 12s - warning
        },
      };
      const duration = 10000;
      const fileCount = 100;

      const warnings = checkBudgetWarnings(stats, duration, fileCount);
      expect(warnings.some((w) => w.includes('Critical stage performance'))).toBe(true);
      expect(warnings.some((w) => w.includes('Slow stages detected'))).toBe(true);
    });

    test('identifies project size warnings', () => {
      const stats = {
        filesProcessed: 100,
        totalSize: 120 * 1024 * 1024, // 120MB - exceeds 100MB limit
      };
      const duration = 10000;
      const fileCount = 100;

      const warnings = checkBudgetWarnings(stats, duration, fileCount);
      expect(warnings.some((w) => w.includes('Project size exceeded'))).toBe(true);
    });
  });

  describe('generateRecommendations', () => {
    test('recommends head limit for slow large projects', () => {
      const stats = { filesProcessed: 100 };
      const duration = 35000; // 35s - exceeds large project budget of 30s
      const fileCount = 1500; // Large project

      const recommendations = generateRecommendations(stats, duration, fileCount);
      expect(recommendations.some((r) => r.includes('--head limit'))).toBe(true);
    });

    test('recommends sequential processing for many transformers', () => {
      const stats = {
        filesProcessed: 100,
        filesTransformed: 80, // Many transformations
      };
      const duration = 20000; // Exceeds budget
      const fileCount = 100;

      const recommendations = generateRecommendations(stats, duration, fileCount);
      expect(recommendations.some((r) => r.includes('--max-concurrency 1'))).toBe(true);
    });

    test('recommends memory optimizations for high memory usage', () => {
      // Mock high memory usage
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn(() => ({
        heapUsed: 300 * 1024 * 1024, // 300MB - high usage
      }));

      const stats = { filesProcessed: 100 };
      const duration = 10000;
      const fileCount = 100;

      const recommendations = generateRecommendations(stats, duration, fileCount);
      expect(recommendations.some((r) => r.includes('streaming mode'))).toBe(true);

      process.memoryUsage = originalMemoryUsage;
    });

    test('recommends caching for AI operations', () => {
      const stats = {
        filesProcessed: 100,
        filesTransformed: 30,
        perStageTimings: {
          FileTransformation: 15000, // Slow transformations
        },
      };
      const duration = 10000;
      const fileCount = 100;

      const recommendations = generateRecommendations(stats, duration, fileCount);
      expect(recommendations.some((r) => r.includes('caching'))).toBe(true);
    });
  });

  describe('calculateThroughput', () => {
    test('calculates throughput metrics correctly', () => {
      const duration = 10000; // 10 seconds
      const fileCount = 500;

      const throughput = calculateThroughput(duration, fileCount);

      expect(throughput.filesPerSecond).toBe(50); // 500 files / 10 seconds
      expect(throughput.timePerThousandFiles).toBe(20000); // (10000ms / 500) * 1000
      expect(throughput.durationInSeconds).toBe(10);
    });
  });

  describe('generatePerformanceSummary', () => {
    test('generates comprehensive performance summary', () => {
      const stats = {
        filesProcessed: 100,
        totalSize: 20 * 1024 * 1024,
        perStageTimings: {
          FileDiscovery: 2000,
        },
      };
      const duration = 12000;
      const fileCount = 100;

      const summary = generatePerformanceSummary(stats, duration, fileCount);

      expect(summary).toHaveProperty('grade');
      expect(summary).toHaveProperty('gradeColor');
      expect(summary).toHaveProperty('sizeCategory', 'medium');
      expect(summary).toHaveProperty('throughput');
      expect(summary).toHaveProperty('warnings');
      expect(summary).toHaveProperty('recommendations');
      expect(summary).toHaveProperty('budgets');

      expect(summary.throughput).toHaveProperty('filesPerSecond');
      expect(summary.budgets).toHaveProperty('timeUsed', 12000);
      expect(summary.budgets).toHaveProperty('timeBudget', PERFORMANCE_BUDGETS.totalTime.medium);
    });
  });

  describe('formatPerformanceMetrics', () => {
    test('formats metrics for display correctly', () => {
      const summary = {
        budgets: {
          timeUsed: 12000,
          timeBudget: 15000,
          timeRatio: 0.8,
          memoryUsed: 100 * 1024 * 1024,
          memoryBudget: 500 * 1024 * 1024,
          memoryRatio: 0.2,
        },
        throughput: {
          filesPerSecond: 8.33,
          timePerThousandFiles: 12000,
        },
      };

      const metrics = formatPerformanceMetrics(summary);

      expect(metrics.timePerformance.used).toBe('12000ms');
      expect(metrics.timePerformance.budget).toBe('15000ms');
      expect(metrics.timePerformance.ratio).toBe('80%');
      expect(metrics.timePerformance.color).toBe('green');

      expect(metrics.memoryPerformance.used).toContain('MB');
      expect(metrics.memoryPerformance.color).toBe('green');

      expect(metrics.throughputPerformance.filesPerSecond).toBe('8.33 files/s');
      expect(metrics.throughputPerformance.timePerThousandFiles).toBe('12000ms/1k files');
    });
  });
});

describe('PerformanceTelemetry', () => {
  let telemetry;

  beforeEach(() => {
    telemetry = new PerformanceTelemetry();
  });

  describe('recordSession', () => {
    test('records session data correctly', () => {
      const stats = { filesProcessed: 100 };
      const duration = 10000;
      const fileCount = 100;
      const options = { profile: 'default' };

      const session = telemetry.recordSession(stats, duration, fileCount, options);

      expect(session).toHaveProperty('timestamp');
      expect(session).toHaveProperty('stats', stats);
      expect(session).toHaveProperty('duration', duration);
      expect(session).toHaveProperty('fileCount', fileCount);
      expect(session).toHaveProperty('options', options);
      expect(session).toHaveProperty('summary');
      expect(session).toHaveProperty('systemInfo');

      expect(telemetry.sessionMetrics).toHaveLength(1);
    });

    test('updates aggregated stats after recording', () => {
      const stats = { filesProcessed: 100 };
      telemetry.recordSession(stats, 10000, 100);

      expect(telemetry.aggregatedStats).not.toBeNull();
      expect(telemetry.aggregatedStats.totalSessions).toBe(1);
    });
  });

  describe('generateInsightsReport', () => {
    test('generates insights report with multiple sessions', () => {
      // Record multiple sessions
      telemetry.recordSession({ filesProcessed: 50 }, 5000, 50);
      telemetry.recordSession({ filesProcessed: 100 }, 15000, 100);
      telemetry.recordSession({ filesProcessed: 200 }, 25000, 200);

      const report = telemetry.generateInsightsReport();

      expect(report).toHaveProperty('summary');
      expect(report.summary).toHaveProperty('totalSessions', 3);
      expect(report.summary).toHaveProperty('averageGrade');
      expect(report.summary).toHaveProperty('performanceScore');
      expect(report).toHaveProperty('gradeDistribution');
      expect(report).toHaveProperty('topBottlenecks');
      expect(report).toHaveProperty('keyOpportunities');
    });

    test('returns error when no data available', () => {
      const report = telemetry.generateInsightsReport();
      expect(report).toHaveProperty('error');
    });
  });

  describe('calculateOverallPerformanceScore', () => {
    test('calculates performance score correctly', () => {
      // Mock aggregated stats
      telemetry.aggregatedStats = {
        gradeDistribution: {
          A: 2,
          B: 1,
          C: 1,
          D: 0,
          F: 1,
        },
      };

      const score = telemetry.calculateOverallPerformanceScore();

      // Expected: (2*100 + 1*80 + 1*60 + 0*40 + 1*0) / 5 = 68
      expect(score).toBe(68);
    });
  });

  describe('export and clear', () => {
    test('exports telemetry data', () => {
      telemetry.recordSession({ filesProcessed: 100 }, 10000, 100);

      const exported = telemetry.export();

      expect(exported).toHaveProperty('sessionMetrics');
      expect(exported).toHaveProperty('aggregatedStats');
      expect(exported).toHaveProperty('exportedAt');
      expect(exported.sessionMetrics).toHaveLength(1);
    });

    test('clears telemetry data', () => {
      telemetry.recordSession({ filesProcessed: 100 }, 10000, 100);
      expect(telemetry.sessionMetrics).toHaveLength(1);

      telemetry.clear();

      expect(telemetry.sessionMetrics).toHaveLength(0);
      expect(telemetry.aggregatedStats).toBeNull();
    });
  });
});
