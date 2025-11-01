// Mock ora for tests
const createMockSpinner = () => ({
  start: jest.fn().mockReturnThis(),
  stop: jest.fn().mockReturnThis(),
  succeed: jest.fn().mockReturnThis(),
  fail: jest.fn().mockReturnThis(),
  warn: jest.fn().mockReturnThis(),
  info: jest.fn().mockReturnThis(),
  clear: jest.fn().mockReturnThis(),
  render: jest.fn().mockReturnThis(),
  frame: jest.fn().mockReturnThis(),
  text: '',
  color: 'cyan',
  isSpinning: false,
});

const ora = jest.fn(() => createMockSpinner());

export default ora;
