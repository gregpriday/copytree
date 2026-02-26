import React from 'react';
import { formatBytes as formatBytesUtil } from '../../utils/performance.js';

// Use dynamic import for ESM-only ink
let Box, Text;
(async () => {
  try {
    const ink = await import('ink');
    Box = ink.Box;
    Text = ink.Text;
  } catch {
    Box = undefined;
    Text = undefined;
  }
})().catch(() => {
  Box = undefined;
  Text = undefined;
});

const StatRow = ({ label, value, color = 'white' }) => {
  return React.createElement(
    Box,
    { justifyContent: 'space-between', width: 40 },
    React.createElement(Text, null, label + ':'),
    React.createElement(Text, { color }, value),
  );
};

const SummaryTable = ({ stats, duration, showDetailedTiming = false }) => {
  if (!stats || Object.keys(stats).length === 0) {
    return null;
  }

  const formatBytes = formatBytesUtil;
  const formatDuration = (ms) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return React.createElement(
    Box,
    {
      flexDirection: 'column',
      marginTop: 1,
      borderStyle: 'single',
      borderColor: 'gray',
      padding: 1,
    },
    React.createElement(Text, { color: 'yellow', bold: true, marginBottom: 1 }, 'Summary'),
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
        color: 'blue',
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
        color: 'yellow',
      }),
    showDetailedTiming &&
      stats.perStageTimings &&
      Object.keys(stats.perStageTimings).length > 0 &&
      React.createElement(
        Box,
        {
          flexDirection: 'column',
          marginTop: 1,
        },
        React.createElement(
          Text,
          {
            color: 'cyan',
            bold: true,
          },
          'Stage Timings:',
        ),
        ...Object.entries(stats.perStageTimings).map(([stageName, timing]) => {
          const metrics = stats.perStageMetrics?.[stageName];
          const memoryDelta = metrics?.memoryUsage?.delta?.heapUsed;
          const memoryInfo = memoryDelta ? ` (${formatBytes(memoryDelta)} heap)` : '';

          return React.createElement(StatRow, {
            key: stageName,
            label: `  ${stageName}`,
            value: formatDuration(timing) + memoryInfo,
            color: 'gray',
          });
        }),
      ),
  );
};

export default SummaryTable;
