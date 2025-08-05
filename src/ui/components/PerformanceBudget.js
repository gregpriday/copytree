import React from 'react';
import { 
  generatePerformanceSummary, 
  formatPerformanceMetrics 
} from '../../utils/performanceBudgets.js';

// Use dynamic import for ESM-only ink
let Box, Text;
(async () => {
  try {
    const ink = await import('ink');
    Box = ink.Box;
    Text = ink.Text;
  } catch (error) {
    // Defer error until first usage attempt
    Box = undefined;
    Text = undefined;
  }
})().catch(() => {
  Box = undefined;
  Text = undefined;
});

const PerformanceBudget = ({ stats, duration, fileCount }) => {
  if (!stats || !duration || !fileCount || fileCount === 0) {
    return null;
  }

  const summary = generatePerformanceSummary(stats, duration, fileCount);
  const metrics = formatPerformanceMetrics(summary);

  return React.createElement(
    Box,
    { flexDirection: 'column', marginTop: 1 },
    
    // Performance Grade Header
    React.createElement(
      Box,
      { justifyContent: 'space-between', width: 50 },
      React.createElement(
        Text,
        { color: summary.gradeColor, bold: true },
        `Performance Grade: ${summary.grade}`
      ),
      React.createElement(
        Text,
        { color: 'gray' },
        `(${summary.sizeCategory} project)`
      )
    ),
    
    // Performance Metrics
    React.createElement(
      Box,
      { flexDirection: 'column', marginTop: 1, marginLeft: 2 },
      
      // Time Performance
      React.createElement(
        Box,
        { justifyContent: 'space-between', width: 45 },
        React.createElement(Text, null, 'Time:'),
        React.createElement(
          Text,
          { color: metrics.timePerformance.color },
          `${metrics.timePerformance.used} / ${metrics.timePerformance.budget} (${metrics.timePerformance.ratio})`
        )
      ),
      
      // Memory Performance
      React.createElement(
        Box,
        { justifyContent: 'space-between', width: 45 },
        React.createElement(Text, null, 'Memory:'),
        React.createElement(
          Text,
          { color: metrics.memoryPerformance.color },
          `${metrics.memoryPerformance.used} / ${metrics.memoryPerformance.budget} (${metrics.memoryPerformance.ratio})`
        )
      ),
      
      // Throughput Performance
      React.createElement(
        Box,
        { justifyContent: 'space-between', width: 45 },
        React.createElement(Text, null, 'Throughput:'),
        React.createElement(
          Text,
          { color: metrics.throughputPerformance.color },
          `${metrics.throughputPerformance.filesPerSecond} | ${metrics.throughputPerformance.timePerThousandFiles}`
        )
      )
    ),
    
    // Budget Warnings
    summary.warnings.length > 0 && React.createElement(
      Box,
      { flexDirection: 'column', marginTop: 1 },
      React.createElement(
        Text,
        { color: 'yellow', bold: true },
        '⚠ Performance Warnings:'
      ),
      ...summary.warnings.map((warning, i) => 
        React.createElement(
          Text,
          { key: i, color: 'yellow', marginLeft: 2 },
          `• ${warning}`
        )
      )
    ),
    
    // Optimization Recommendations
    summary.recommendations.length > 0 && React.createElement(
      Box,
      { flexDirection: 'column', marginTop: 1 },
      React.createElement(
        Text,
        { color: 'cyan', bold: true },
        '💡 Optimization Recommendations:'
      ),
      ...summary.recommendations.slice(0, 3).map((recommendation, i) => 
        React.createElement(
          Text,
          { key: i, color: 'cyan', marginLeft: 2 },
          `• ${recommendation}`
        )
      ),
      // Show count if there are more recommendations
      summary.recommendations.length > 3 && React.createElement(
        Text,
        { color: 'gray', marginLeft: 2, marginTop: 1 },
        `... and ${summary.recommendations.length - 3} more recommendations`
      )
    )
  );
};

export default PerformanceBudget;