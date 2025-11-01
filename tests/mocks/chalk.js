// Mock chalk for tests
const chalk = {
  red: jest.fn((text) => text),
  green: jest.fn((text) => text),
  yellow: jest.fn((text) => text),
  blue: jest.fn((text) => text),
  cyan: jest.fn((text) => text),
  magenta: jest.fn((text) => text),
  gray: jest.fn((text) => text),
  white: jest.fn((text) => text),
  black: jest.fn((text) => text),
  bold: jest.fn((text) => text),
  dim: jest.fn((text) => text),
  italic: jest.fn((text) => text),
  underline: jest.fn((text) => text),
  inverse: jest.fn((text) => text),
  strikethrough: jest.fn((text) => text),
  bgRed: jest.fn((text) => text),
  bgGreen: jest.fn((text) => text),
  bgYellow: jest.fn((text) => text),
  bgBlue: jest.fn((text) => text),
  bgCyan: jest.fn((text) => text),
  bgMagenta: jest.fn((text) => text),
};

// Make each method chainable
Object.keys(chalk).forEach((key) => {
  chalk[key] = Object.assign(chalk[key], chalk);
});

export default chalk;
