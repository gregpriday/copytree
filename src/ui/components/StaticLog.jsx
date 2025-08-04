const React = require('react');

const LogEntry = ({ log, renderInk }) => {
  const getColor = (type) => {
    switch (type) {
    case 'success': return 'green';
    case 'error': return 'red';
    case 'warning': return 'yellow';
    case 'info': return 'blue';
    default: return 'white';
    }
  };

  const getIcon = (type) => {
    switch (type) {
    case 'success': return '✓';
    case 'error': return '✗';
    case 'warning': return '⚠';
    case 'info': return 'ℹ';
    default: return '•';
    }
  };

  return React.createElement(
    renderInk.Box,
    null,
    React.createElement(
      renderInk.Text,
      { color: getColor(log.type), marginRight: 1 },
      getIcon(log.type),
    ),
    React.createElement(
      renderInk.Text,
      null,
      log.message,
    ),
  );
};

const StaticLog = ({ logs, renderInk }) => {
  if (!logs || logs.length === 0) {
    return null;
  }

  return React.createElement(
    renderInk.Static,
    { items: logs },
    (log, index) => React.createElement(LogEntry, { key: index, log, renderInk }),
  );
};

module.exports = StaticLog;