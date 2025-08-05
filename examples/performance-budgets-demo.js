#!/usr/bin/env node

/**
 * Performance Budgets Demo
 * 
 * This script demonstrates the new performance budgets and telemetry system
 * implemented in Phase 4.2 of the architecture improvements.
 * 
 * Usage: node examples/performance-budgets-demo.js
 */

import {
  PERFORMANCE_BUDGETS,
  getProjectSizeCategory,
  calculatePerformanceGrade,
  getGradeColor,
  checkBudgetWarnings,
  generateRecommendations,
  generatePerformanceSummary,
  formatPerformanceMetrics,
  PerformanceTelemetry,
  globalTelemetry
} from '../src/utils/performanceBudgets.js';

import { formatBytes } from '../src/utils/performance.js';

console.log('🚀 CopyTree Performance Budgets Demo\n');

// Demo 1: Performance Budgets Overview
console.log('📊 Performance Budgets Overview:');
console.log('================================');
console.log('Total Time Budgets:');
console.log(`  Small projects (<100 files): ${PERFORMANCE_BUDGETS.totalTime.small}ms`);
console.log(`  Medium projects (100-1000): ${PERFORMANCE_BUDGETS.totalTime.medium}ms`);
console.log(`  Large projects (1000+): ${PERFORMANCE_BUDGETS.totalTime.large}ms`);
console.log();
console.log('Memory Budgets:');
console.log(`  Warning threshold: ${formatBytes(PERFORMANCE_BUDGETS.memoryUsage.warning)}`);
console.log(`  Maximum limit: ${formatBytes(PERFORMANCE_BUDGETS.memoryUsage.max)}`);
console.log();
console.log('Stage Time Budgets:');
console.log(`  Warning threshold: ${PERFORMANCE_BUDGETS.stageTime.warning}ms`);
console.log(`  Critical threshold: ${PERFORMANCE_BUDGETS.stageTime.critical}ms`);
console.log();

// Demo 2: Project Size Categorization
console.log('📁 Project Size Categorization:');
console.log('===============================');
const testFileCounts = [50, 150, 1500, 5000];
testFileCounts.forEach(count => {
  const category = getProjectSizeCategory(count);
  console.log(`  ${count} files → ${category} project`);
});
console.log();

// Demo 3: Performance Grading Examples
console.log('🎯 Performance Grading Examples:');
console.log('================================');

const demoScenarios = [
  {
    name: 'Excellent Performance (A Grade)',
    stats: {
      filesProcessed: 100,
      totalSize: 10 * 1024 * 1024, // 10MB
      perStageTimings: {
        'FileDiscovery': 1000,
        'Transformation': 2000
      }
    },
    duration: 8000, // 8s for medium project (budget: 15s)
    fileCount: 100
  },
  {
    name: 'Poor Performance (F Grade)',
    stats: {
      filesProcessed: 100,
      totalSize: 120 * 1024 * 1024, // 120MB - exceeds limit
      perStageTimings: {
        'FileDiscovery': 25000, // 25s - critical
        'Transformation': 15000 // 15s - warning
      }
    },
    duration: 45000, // 45s for medium project (budget: 15s)
    fileCount: 100
  },
  {
    name: 'Average Performance (C Grade)',
    stats: {
      filesProcessed: 500,
      totalSize: 60 * 1024 * 1024, // 60MB - warning
      perStageTimings: {
        'FileDiscovery': 8000,
        'Transformation': 12000 // 12s - warning
      }
    },
    duration: 18000, // 18s for medium project (budget: 15s)
    fileCount: 500
  }
];

demoScenarios.forEach(scenario => {
  console.log(`\n${scenario.name}:`);
  console.log('-'.repeat(scenario.name.length + 1));
  
  const grade = calculatePerformanceGrade(scenario.stats, scenario.duration, scenario.fileCount);
  const gradeColor = getGradeColor(grade);
  const warnings = checkBudgetWarnings(scenario.stats, scenario.duration, scenario.fileCount);
  const recommendations = generateRecommendations(scenario.stats, scenario.duration, scenario.fileCount);
  
  console.log(`  Grade: ${grade} (color: ${gradeColor})`);
  console.log(`  Duration: ${scenario.duration}ms for ${scenario.fileCount} files`);
  console.log(`  Project Size: ${formatBytes(scenario.stats.totalSize)}`);
  
  if (warnings.length > 0) {
    console.log('  ⚠️  Warnings:');
    warnings.forEach(warning => console.log(`    • ${warning}`));
  }
  
  if (recommendations.length > 0) {
    console.log('  💡 Recommendations:');
    recommendations.slice(0, 3).forEach(rec => console.log(`    • ${rec}`));
  }
});

console.log();

// Demo 4: Performance Summary and Metrics
console.log('📈 Performance Summary & Metrics:');
console.log('=================================');

const summaryExample = {
  stats: {
    filesProcessed: 250,
    totalSize: 30 * 1024 * 1024, // 30MB
    perStageTimings: {
      'FileDiscovery': 3000,
      'ProfileFiltering': 1500,
      'Transformation': 8000,
      'OutputFormatting': 2000
    }
  },
  duration: 14500, // 14.5s
  fileCount: 250
};

const summary = generatePerformanceSummary(
  summaryExample.stats, 
  summaryExample.duration, 
  summaryExample.fileCount
);

const metrics = formatPerformanceMetrics(summary);

console.log(`Performance Grade: ${summary.grade} (${summary.gradeColor})`);
console.log(`Project Category: ${summary.sizeCategory}`);
console.log(`Throughput: ${summary.throughput.filesPerSecond} files/s`);
console.log();
console.log('Detailed Metrics:');
console.log(`  Time: ${metrics.timePerformance.used} / ${metrics.timePerformance.budget} (${metrics.timePerformance.ratio}) [${metrics.timePerformance.color}]`);
console.log(`  Memory: ${metrics.memoryPerformance.used} / ${metrics.memoryPerformance.budget} (${metrics.memoryPerformance.ratio}) [${metrics.memoryPerformance.color}]`);
console.log(`  Throughput: ${metrics.throughputPerformance.filesPerSecond} | ${metrics.throughputPerformance.timePerThousandFiles} [${metrics.throughputPerformance.color}]`);

if (summary.warnings.length > 0) {
  console.log('\n⚠️  Performance Warnings:');
  summary.warnings.forEach(warning => console.log(`  • ${warning}`));
}

if (summary.recommendations.length > 0) {
  console.log('\n💡 Optimization Recommendations:');
  summary.recommendations.slice(0, 3).forEach(rec => console.log(`  • ${rec}`));
}

console.log();

// Demo 5: Telemetry System
console.log('📊 Telemetry System Demo:');
console.log('=========================');

const telemetry = new PerformanceTelemetry();

// Record several sessions to demonstrate telemetry
const sessionData = [
  { stats: { filesProcessed: 50 }, duration: 4000, fileCount: 50, options: { profile: 'default' } },
  { stats: { filesProcessed: 150 }, duration: 12000, fileCount: 150, options: { profile: 'custom' } },
  { stats: { filesProcessed: 300 }, duration: 20000, fileCount: 300, options: { profile: 'default' } },
  { stats: { filesProcessed: 500 }, duration: 35000, fileCount: 500, options: { profile: 'large' } },
  { stats: { filesProcessed: 100 }, duration: 8000, fileCount: 100, options: { profile: 'default' } }
];

console.log('Recording performance sessions...');
sessionData.forEach((session, index) => {
  telemetry.recordSession(session.stats, session.duration, session.fileCount, session.options);
  console.log(`  Session ${index + 1}: ${session.fileCount} files in ${session.duration}ms`);
});

console.log('\nGenerating telemetry insights...');
const insights = telemetry.generateInsightsReport();

console.log('\nTelemetry Summary:');
console.log(`  Total sessions: ${insights.summary.totalSessions}`);
console.log(`  Average grade: ${insights.summary.averageGrade}`);
console.log(`  Performance score: ${insights.summary.performanceScore}/100`);
console.log(`  Average duration: ${insights.summary.averageDuration}ms`);
console.log(`  Average file count: ${insights.summary.averageFileCount}`);
console.log(`  Average memory usage: ${insights.summary.averageMemoryUsage}`);

console.log('\nGrade Distribution:');
Object.entries(insights.gradeDistribution).forEach(([grade, count]) => {
  if (count > 0) {
    console.log(`  ${grade}: ${count} sessions`);
  }
});

if (insights.trends) {
  console.log('\nPerformance Trends:');
  console.log(`  Duration: ${insights.trends.duration}`);
  console.log(`  Memory: ${insights.trends.memory}`);
}

if (insights.topBottlenecks.length > 0) {
  console.log('\nTop Performance Bottlenecks:');
  insights.topBottlenecks.forEach((bottleneck, index) => {
    console.log(`  ${index + 1}. ${bottleneck.stageName} (${bottleneck.frequency} times, avg: ${Math.round(bottleneck.averageTime)}ms, severity: ${bottleneck.severity})`);
  });
}

if (insights.keyOpportunities.length > 0) {
  console.log('\nKey Optimization Opportunities:');
  insights.keyOpportunities.forEach((opportunity, index) => {
    console.log(`  ${index + 1}. [${opportunity.severity.toUpperCase()}] ${opportunity.description}`);
    console.log(`     → ${opportunity.recommendation}`);
  });
}

console.log();

// Demo 6: Integration with CLI
console.log('🔧 CLI Integration:');
console.log('==================');
console.log('To enable performance budgets in the CLI, use the --info flag:');
console.log('  copytree /path/to/project --info');
console.log();
console.log('This will:');
console.log('  • Show color-coded performance metrics');
console.log('  • Display performance grade (A-F)');
console.log('  • Highlight budget violations');
console.log('  • Provide optimization recommendations');
console.log('  • Record telemetry data for insights');
console.log();
console.log('Performance budgets are based on README.md targets:');
console.log('  • Process 10,000 files in < 30 seconds');
console.log('  • Memory usage < 500MB for large projects');
console.log('  • Support projects up to 100MB total size');
console.log('  • Stream files > 10MB without loading into memory');

console.log('\n✨ Demo completed! Performance budgets and telemetry are now active.\n');