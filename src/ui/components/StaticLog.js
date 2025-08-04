import React from 'react';

// Use dynamic import for ESM-only ink
let Static, Box, Text;
(async () => {
  try {
    const ink = await import('ink');
    Static = ink.Static;
    Box = ink.Box;
    Text = ink.Text;
  } catch (error) {
    // Defer error until first usage attempt
    Static = undefined;
    Box = undefined;
    Text = undefined;
  }
})().catch(() => {
  Static = undefined;
  Box = undefined;
  Text = undefined;
});

const LogEntry = ({ log }) => {
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
    Box,
    null,
    React.createElement(
      Text,
      { color: getColor(log.type), marginRight: 1 },
      getIcon(log.type),
    ),
    React.createElement(
      Text,
      null,
      log.message,
    ),
  );
};

const StaticLog = ({ logs }) => {
  if (!logs || logs.length === 0) {
    return null;
  }

  return React.createElement(
    Static,
    { items: logs },
    (log, index) => React.createElement(LogEntry, { key: index, log }),
  );
};

export default StaticLog;