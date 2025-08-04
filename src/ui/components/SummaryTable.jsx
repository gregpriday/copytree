const React = require('react');

const StatRow = ({ label, value, color = 'white', renderInk }) => {
  return React.createElement(
    renderInk.Box,
    { justifyContent: 'space-between', width: 40 },
    React.createElement(renderInk.Text, null, label + ':'),
    React.createElement(renderInk.Text, { color }, value),
  );
};

const SummaryTable = ({ stats, duration, renderInk }) => {
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
    renderInk.Box,
    { 
      flexDirection: 'column', 
      marginTop: 1,
      borderStyle: 'single',
      borderColor: 'gray',
      padding: 1,
    },
    React.createElement(
      renderInk.Text,
      { color: 'yellow', bold: true, marginBottom: 1 },
      'Summary',
    ),
    stats.filesProcessed !== undefined &&
			React.createElement(StatRow, {
			  label: 'Files processed',
			  value: stats.filesProcessed.toString(),
			  color: 'green',
			  renderInk,
			}),
    stats.directoriesProcessed !== undefined &&
			React.createElement(StatRow, {
			  label: 'Directories processed',
			  value: stats.directoriesProcessed.toString(),
			  color: 'cyan',
			  renderInk,
			}),
    stats.filesTransformed !== undefined &&
			React.createElement(StatRow, {
			  label: 'Files transformed',
			  value: stats.filesTransformed.toString(),
			  color: 'magenta',
			  renderInk,
			}),
    stats.totalSize !== undefined &&
			React.createElement(StatRow, {
			  label: 'Total size',
			  value: formatBytes(stats.totalSize),
			  color: 'blue',
			  renderInk,
			}),
    stats.outputSize !== undefined &&
			React.createElement(StatRow, {
			  label: 'Output size',
			  value: formatBytes(stats.outputSize),
			  color: 'blue',
			  renderInk,
			}),
    duration &&
			React.createElement(StatRow, {
			  label: 'Duration',
			  value: formatDuration(duration),
			  color: 'yellow',
			  renderInk,
			}),
  );
};

module.exports = SummaryTable;