import path from 'path';
import { toPosix } from '../../../src/utils/pathUtils.js';

describe('pathUtils', () => {
  describe('toPosix', () => {
    it('returns forward-slash paths unchanged', () => {
      expect(toPosix('src/utils/helpers.js')).toBe('src/utils/helpers.js');
    });

    it('handles single-segment paths', () => {
      expect(toPosix('file.js')).toBe('file.js');
    });

    it('handles empty strings', () => {
      expect(toPosix('')).toBe('');
    });

    it('handles paths with trailing separator', () => {
      expect(toPosix('src/utils/')).toBe('src/utils/');
    });

    it('handles paths with leading separator', () => {
      expect(toPosix('/src/utils/file.js')).toBe('/src/utils/file.js');
    });

    it('converts platform-native separators to forward slashes', () => {
      // Build a path using the platform separator, then verify toPosix
      // converts it. On POSIX this is a no-op; on Windows it converts.
      const nativePath = ['src', 'utils', 'helpers.js'].join(path.sep);
      expect(toPosix(nativePath)).toBe('src/utils/helpers.js');
    });

    it('converts path.relative output to POSIX format', () => {
      // Simulate what FileDiscoveryStage does:
      // path.relative returns platform-native separators
      const base = path.join('/project', 'root');
      const full = path.join('/project', 'root', 'src', 'file.js');
      const relative = path.relative(base, full);
      expect(toPosix(relative)).toBe('src/file.js');
    });

    it('converts deeply nested path.join output', () => {
      const joined = path.join('a', 'b', 'c', 'd', 'e', 'f.txt');
      expect(toPosix(joined)).toBe('a/b/c/d/e/f.txt');
    });
  });
});
