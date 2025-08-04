const React = require('react');

// Use dynamic import for ESM-only ink in CommonJS context
let Box, Text, Newline;
(async () => {
  try {
    const ink = await import('ink');
    Box = ink.Box;
    Text = ink.Text;
    Newline = ink.Newline;
  } catch (error) {
    // Defer error until first usage attempt
    Box = undefined;
    Text = undefined;
    Newline = undefined;
  }
})().catch(() => {
  Box = undefined;
  Text = undefined;
  Newline = undefined;
});

const TreeNode = ({ node, depth = 0, isLast = false, prefix = '' }) => {
  const indent = '  '.repeat(depth);
  const connector = isLast ? '└── ' : '├── ';
  const nodePrefix = depth === 0 ? '' : indent + connector;

  if (node.type === 'directory') {
    const children = node.children || [];
    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(
        Text,
        { color: 'cyan', bold: true },
        nodePrefix + node.name + '/',
      ),
      ...children.map((child, index) =>
        React.createElement(TreeNode, {
          key: child.name,
          node: child,
          depth: depth + 1,
          isLast: index === children.length - 1,
          prefix: prefix + (isLast ? '  ' : '│ '),
        }),
      ),
    );
  }

  return React.createElement(
    Text,
    { color: node.transformed ? 'green' : 'white' },
    nodePrefix + node.name + (node.size ? ` (${node.size})` : ''),
  );
};

const Results = ({ results, output, format, showOutput = false }) => {
  if (!results && !output) {
    return null;
  }

  if (format === 'tree' && results) {
    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(
        Text,
        { color: 'yellow', bold: true },
        'File Structure:',
      ),
      React.createElement(TreeNode, { node: results }),
    );
  }

  if (showOutput && output) {
    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(
        Text,
        { color: 'yellow', bold: true },
        `Output (${format}):`,
      ),
      results && results.instructions && React.createElement(
        Text,
        { color: 'gray' },
        'Instructions: included',
      ),
      React.createElement(
        Box,
        { borderStyle: 'single', borderColor: 'gray', padding: 1 },
        React.createElement(
          Text,
          null,
          output.length > 1000 ? output.substring(0, 1000) + '...' : output,
        ),
      ),
    );
  }

  return null;
};

module.exports = Results;