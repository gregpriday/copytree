const React = require('react');
const { useAppContext } = require('../contexts/AppContext.js');

const TreeNode = ({ node, depth = 0, isLast = false, prefix = '', renderInk }) => {
  const indent = '  '.repeat(depth);
  const connector = isLast ? '└── ' : '├── ';
  const nodePrefix = depth === 0 ? '' : indent + connector;

  if (node.type === 'directory') {
    const children = node.children || [];
    return React.createElement(
      renderInk.Box,
      { flexDirection: 'column' },
      React.createElement(
        renderInk.Text,
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
          renderInk,
        }),
      ),
    );
  }

  return React.createElement(
    renderInk.Text,
    { color: node.transformed ? 'green' : 'white' },
    nodePrefix + node.name + (node.size ? ` (${node.size})` : ''),
  );
};

const Results = ({ results, output, format, showOutput = false, renderInk }) => {
  if (!results && !output) {
    return null;
  }

  if (format === 'tree' && results) {
    return React.createElement(
      renderInk.Box,
      { flexDirection: 'column' },
      React.createElement(
        renderInk.Text,
        { color: 'yellow', bold: true },
        'File Structure:',
      ),
      React.createElement(TreeNode, { node: results, renderInk }),
    );
  }

  if (showOutput && output) {
    return React.createElement(
      renderInk.Box,
      { flexDirection: 'column' },
      React.createElement(
        renderInk.Text,
        { color: 'yellow', bold: true },
        `Output (${format}):`,
      ),
      results && results.instructions && React.createElement(
        renderInk.Text,
        { color: 'gray' },
        'Instructions: included',
      ),
      React.createElement(
        renderInk.Box,
        { borderStyle: 'single', borderColor: 'gray', padding: 1 },
        React.createElement(
          renderInk.Text,
          null,
          output.length > 1000 ? output.substring(0, 1000) + '...' : output,
        ),
      ),
    );
  }

  return null;
};

module.exports = Results;