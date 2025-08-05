// Mock for ink to avoid ESM compatibility issues

import React from 'react';

// Mock Box component - just renders children
export const Box = ({ children, ...props }) => {
  return React.createElement('div', props, children);
};

// Mock Text component - renders text content
export const Text = ({ children, color, bold, ...props }) => {
  return React.createElement('span', { 
    ...props,
    style: { 
      color: color || 'inherit',
      fontWeight: bold ? 'bold' : 'normal',
      ...props.style 
    }
  }, children);
};

// Default export with named exports
export default {
  Box,
  Text
};