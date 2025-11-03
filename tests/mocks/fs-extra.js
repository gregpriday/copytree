// Centralized fs-extra mock for consistent mocking across all tests

export const pathExists = jest.fn().mockResolvedValue(true);
export const stat = jest.fn().mockResolvedValue({ isDirectory: () => true });
export const writeFile = jest.fn().mockResolvedValue();
export const createWriteStream = jest.fn(() => ({
  write: jest.fn(),
  end: jest.fn((cb) => cb?.()),
}));
export const ensureDir = jest.fn().mockResolvedValue();
export const ensureDirSync = jest.fn();
export const readFile = jest.fn().mockResolvedValue('');
export const readdir = jest.fn().mockResolvedValue([]);
export const remove = jest.fn().mockResolvedValue();
export const readFileSync = jest.fn().mockReturnValue('');
export const writeFileSync = jest.fn();
export const existsSync = jest.fn().mockReturnValue(false);
export const removeSync = jest.fn();
export const mkdtempSync = jest.fn().mockReturnValue('/tmp/test-temp-dir');
export const readdirSync = jest.fn().mockReturnValue([]);
export const rmSync = jest.fn();
export const readJson = jest.fn().mockResolvedValue({});
export const readJsonSync = jest.fn().mockReturnValue({});
export const writeJson = jest.fn().mockResolvedValue();
export const writeJsonSync = jest.fn();
export const copy = jest.fn().mockResolvedValue();
export const copySync = jest.fn();
export const move = jest.fn().mockResolvedValue();
export const moveSync = jest.fn();
export const emptyDir = jest.fn().mockResolvedValue();
export const emptyDirSync = jest.fn();
export const outputFile = jest.fn().mockResolvedValue();
export const outputFileSync = jest.fn();
export const outputJson = jest.fn().mockResolvedValue();
export const outputJsonSync = jest.fn();
export const unlink = jest.fn().mockResolvedValue();

const mock = {
  pathExists,
  stat,
  writeFile,
  createWriteStream,
  ensureDir,
  ensureDirSync,
  readFile,
  readdir,
  remove,
  readFileSync,
  writeFileSync,
  existsSync,
  removeSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  readJson,
  readJsonSync,
  writeJson,
  writeJsonSync,
  copy,
  copySync,
  move,
  moveSync,
  emptyDir,
  emptyDirSync,
  outputFile,
  outputFileSync,
  outputJson,
  outputJsonSync,
  unlink,
};

mock.default = mock;

export const resetFsExtraMock = () => {
  Object.values(mock).forEach((fn) => {
    if (jest.isMockFunction(fn)) {
      fn.mockClear();
    }
  });
};

export default mock;
