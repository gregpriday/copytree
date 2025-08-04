import React from 'react';

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

const StatRow = ({ label, value, color = 'white' }) => {
  return React.createElement(
    Box,
    { justifyContent: 'space-between', width: 40 },
    React.createElement(Text, null, label + ':'),
    React.createElement(Text, { color }, value),
  );
};

const SummaryTable = ({ stats, duration }) => {
  if (!stats || Object.keys(stats).length === 0) {
    return null;
  }

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

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
  );
};

export default SummaryTable;