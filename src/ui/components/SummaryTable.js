import React from 'react';
import { formatBytes as formatBytesUtil } from '../../utils/performance.js';
import PerformanceBudget from './PerformanceBudget.js';
import { 
  PERFORMANCE_BUDGETS, 
  getProjectSizeCategory 
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

const StatRow = ({ label, value, color = 'white', budgetInfo }) => {
  return React.createElement(
    Box,
    { justifyContent: 'space-between', width: 40 },
    React.createElement(Text, null, label + ':'),
    React.createElement(
      Box,
      { flexDirection: 'column', alignItems: 'flex-end' },
      React.createElement(Text, { color }, value),
      budgetInfo && React.createElement(
        Text,
        { color: 'gray', fontSize: 10 },
        budgetInfo
      )
    ),
  );
};

const SummaryTable = ({ stats, duration, showDetailedTiming = false, showPerformanceBudgets = false }) => {
  if (!stats || Object.keys(stats).length === 0) {
    return null;
  }

  // Use the performance utility for consistent formatting
  const formatBytes = formatBytesUtil;

  const formatDuration = (ms) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  // Performance budget calculations
  const fileCount = stats.filesProcessed || 0;
  const sizeCategory = getProjectSizeCategory(fileCount);
  const timeBudget = PERFORMANCE_BUDGETS.totalTime[sizeCategory];
  const memoryBudget = PERFORMANCE_BUDGETS.memoryUsage.max;
  
  // Color coding based on performance budgets
  const getDurationColor = (duration) => {
    if (!duration) return 'yellow';
    const ratio = duration / timeBudget;
    if (ratio > 1.2) return 'red';
    if (ratio > 1.0) return 'yellow';
    return 'green';
  };

  const getMemoryColor = (memoryUsage) => {
    if (!memoryUsage) return 'blue';
    const ratio = memoryUsage / memoryBudget;
    if (ratio > 0.8) return 'red';
    if (ratio > 0.5) return 'yellow';
    return 'green';
  };

  const getSizeColor = (totalSize) => {
    if (!totalSize) return 'blue';
    const ratio = totalSize / PERFORMANCE_BUDGETS.projectSize.max;
    if (ratio > 1.0) return 'red';
    if (ratio > 0.5) return 'yellow';
    return 'green';
  };

  // Get current memory usage (simplified)
  const currentMemory = process.memoryUsage().heapUsed;

  return React.createElement(
    Box,
    { 
      flexDirection: 'column', 
      marginTop: 1,
      borderStyle: 'single',
      borderColor: 'gray',
      padding: 1,
    },
    React.createElement(
      Text,
      { color: 'yellow', bold: true, marginBottom: 1 },
      'Summary',
    ),
    stats.filesProcessed !== undefined &&
			React.createElement(StatRow, {
			  label: 'Files processed',
			  value: stats.filesProcessed.toString(),
			  color: 'green',
			}),
    stats.directoriesProcessed !== undefined &&
			React.createElement(StatRow, {
			  label: 'Directories processed',
			  value: stats.directoriesProcessed.toString(),
			  color: 'cyan',
			}),
    stats.filesTransformed !== undefined &&
			React.createElement(StatRow, {
			  label: 'Files transformed',
			  value: stats.filesTransformed.toString(),
			  color: 'magenta',
			}),
    stats.totalSize !== undefined &&
			React.createElement(StatRow, {
			  label: 'Total size',
			  value: formatBytes(stats.totalSize),
			  color: getSizeColor(stats.totalSize),
			  budgetInfo: showPerformanceBudgets ? `budget: ${formatBytes(PERFORMANCE_BUDGETS.projectSize.max)}` : undefined,
			}),
    stats.outputSize !== undefined &&
			React.createElement(StatRow, {
			  label: 'Output size',
			  value: formatBytes(stats.outputSize),
			  color: 'blue',
			}),
    duration &&
			React.createElement(StatRow, {
			  label: 'Duration',
			  value: formatDuration(duration),
			  color: getDurationColor(duration),
			  budgetInfo: showPerformanceBudgets ? `budget: ${formatDuration(timeBudget)} (${sizeCategory})` : undefined,
			}),
    // Show current memory usage if performance budgets are enabled
    showPerformanceBudgets &&
			React.createElement(StatRow, {
			  label: 'Memory usage',
			  value: formatBytes(currentMemory),
			  color: getMemoryColor(currentMemory),
			  budgetInfo: `budget: ${formatBytes(memoryBudget)}`,
			}),
    // Show stage timing breakdown if detailed timing is enabled and available
    showDetailedTiming && stats.perStageTimings && Object.keys(stats.perStageTimings).length > 0 &&
			React.createElement(Box, { 
				flexDirection: 'column', 
				marginTop: 1 
			},
				React.createElement(Text, { 
					color: 'cyan', 
					bold: true 
				}, 'Stage Timings:'),
				...Object.entries(stats.perStageTimings).map(([stageName, timing]) => {
					const metrics = stats.perStageMetrics?.[stageName];
					const memoryDelta = metrics?.memoryUsage?.delta?.heapUsed;
					const memoryInfo = memoryDelta ? ` (${formatBytes(memoryDelta)} heap)` : '';
					
					// Color code stages based on performance budgets
					const getStageColor = (timing) => {
						if (timing > PERFORMANCE_BUDGETS.stageTime.critical) return 'red';
						if (timing > PERFORMANCE_BUDGETS.stageTime.warning) return 'yellow';
						return 'gray';
					};
					
					return React.createElement(StatRow, {
						key: stageName,
						label: `  ${stageName}`,
						value: formatDuration(timing) + memoryInfo,
						color: getStageColor(timing),
						budgetInfo: showPerformanceBudgets && timing > PERFORMANCE_BUDGETS.stageTime.warning ? 
							(timing > PERFORMANCE_BUDGETS.stageTime.critical ? 'CRITICAL' : 'SLOW') : undefined
					});
				})
			),
    // Show average and total stage time if available
    showDetailedTiming && stats.totalStageTime > 0 &&
			React.createElement(StatRow, {
			  label: 'Total stage time',
			  value: formatDuration(stats.totalStageTime),
			  color: 'yellow',
			}),
    showDetailedTiming && stats.averageStageTime > 0 &&
			React.createElement(StatRow, {
			  label: 'Average stage time',
			  value: formatDuration(stats.averageStageTime),
			  color: 'yellow',
			}),
    
    // Show performance budget analysis if enabled and we have the necessary data
    showPerformanceBudgets && duration && fileCount > 0 &&
			React.createElement(PerformanceBudget, {
			  stats,
			  duration,
			  fileCount
			}),
  );
};

export default SummaryTable;