import { jest } from '@jest/globals';
import fs from 'fs-extra';
import { detect, isConvertibleDocument } from '../../../../src/utils/BinaryDetector.js';

jest.mock('../../../../src/utils/BinaryDetector.js', () => ({
  detect: jest.fn(),
  isConvertibleDocument: jest.fn(),
}));

import FileLoadingStage from '../../../../src/pipeline/stages/FileLoadingStage.js';

describe('FileLoadingStage', () => {
  beforeEach(() => {
    detect.mockResolvedValue({ isBinary: false, category: 'text', ext: '.txt' });
    isConvertibleDocument.mockReturnValue(false);
  });

  describe('CRLF normalization', () => {
    test('normalizes CRLF to LF in text file content', async () => {
      fs.readFile.mockResolvedValue('line1\r\nline2\r\nline3\r\n');

      const stage = new FileLoadingStage();
      const input = {
        files: [{ path: 'crlf.txt', absolutePath: '/tmp/crlf.txt' }],
      };

      const result = await stage.process(input);

      expect(result.files[0].content).toBe('line1\nline2\nline3\n');
      expect(result.files[0].content).not.toContain('\r');
    });

    test('normalizes lone CR to LF', async () => {
      fs.readFile.mockResolvedValue('line1\rline2\rline3\r');

      const stage = new FileLoadingStage();
      const input = {
        files: [{ path: 'cr.txt', absolutePath: '/tmp/cr.txt' }],
      };

      const result = await stage.process(input);

      expect(result.files[0].content).toBe('line1\nline2\nline3\n');
      expect(result.files[0].content).not.toContain('\r');
    });

    test('preserves LF-only content unchanged', async () => {
      fs.readFile.mockResolvedValue('line1\nline2\nline3\n');

      const stage = new FileLoadingStage();
      const input = {
        files: [{ path: 'lf.txt', absolutePath: '/tmp/lf.txt' }],
      };

      const result = await stage.process(input);

      expect(result.files[0].content).toBe('line1\nline2\nline3\n');
    });

    test('handles mixed line endings', async () => {
      fs.readFile.mockResolvedValue('line1\r\nline2\rline3\nline4\r\n');

      const stage = new FileLoadingStage();
      const input = {
        files: [{ path: 'mixed.txt', absolutePath: '/tmp/mixed.txt' }],
      };

      const result = await stage.process(input);

      expect(result.files[0].content).toBe('line1\nline2\nline3\nline4\n');
      expect(result.files[0].content).not.toContain('\r');
    });

    test('handles empty string', async () => {
      fs.readFile.mockResolvedValue('');

      const stage = new FileLoadingStage();
      const result = await stage.process({
        files: [{ path: 'empty.txt', absolutePath: '/tmp/empty.txt' }],
      });

      expect(result.files[0].content).toBe('');
    });

    test('handles content with no newlines', async () => {
      fs.readFile.mockResolvedValue('no newline here');

      const stage = new FileLoadingStage();
      const result = await stage.process({
        files: [{ path: 'single.txt', absolutePath: '/tmp/single.txt' }],
      });

      expect(result.files[0].content).toBe('no newline here');
    });

    test('handles content with only CR characters', async () => {
      fs.readFile.mockResolvedValue('\r\r\r');

      const stage = new FileLoadingStage();
      const result = await stage.process({
        files: [{ path: 'cr-only.txt', absolutePath: '/tmp/cr-only.txt' }],
      });

      expect(result.files[0].content).toBe('\n\n\n');
      expect(result.files[0].content).not.toContain('\r');
    });
  });

  describe('structure-only patterns with nocase', () => {
    test('matches structure-only pattern case-insensitively on win32', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      try {
        const stage = new FileLoadingStage({
          config: {
            get: jest.fn((key, defaultValue) => {
              if (key === 'copytree.structureOnlyPatterns') return ['*.lock'];
              return defaultValue;
            }),
          },
        });

        const input = {
          files: [{ path: 'Package.LOCK', absolutePath: '/tmp/Package.LOCK' }],
        };

        const result = await stage.process(input);

        expect(result.files[0].content).toBe('[Content skipped for AI context optimization]');
        expect(result.files[0].isBinary).toBe(true);
        expect(result.files[0].binaryCategory).toBe('structure-only');
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      }
    });

    test('does not match case-insensitively on non-Windows', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });

      try {
        fs.readFile.mockResolvedValue('lock content');

        const stage = new FileLoadingStage({
          config: {
            get: jest.fn((key, defaultValue) => {
              if (key === 'copytree.structureOnlyPatterns') return ['*.lock'];
              return defaultValue;
            }),
          },
        });

        const input = {
          files: [{ path: 'Package.LOCK', absolutePath: '/tmp/Package.LOCK' }],
        };

        const result = await stage.process(input);

        // On Linux, *.lock should NOT match Package.LOCK (case-sensitive)
        expect(result.files[0].content).toBe('lock content');
        expect(result.files[0].isBinary).toBe(false);
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      }
    });
  });
});
