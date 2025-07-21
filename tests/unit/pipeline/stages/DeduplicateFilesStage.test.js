const DeduplicateFilesStage = require('../../../../src/pipeline/stages/DeduplicateFilesStage');
const crypto = require('crypto');

describe('DeduplicateFilesStage', () => {
  let stage;
  let mockContext;

  beforeEach(() => {
    stage = new DeduplicateFilesStage();
    mockContext = {
      emit: jest.fn(),
      options: {
        dedupe: true
      }
    };
  });

  describe('process', () => {
    it('should remove duplicate files based on content hash', async () => {
      const files = [
        { path: 'file1.js', content: 'const a = 1;' },
        { path: 'file2.js', content: 'const a = 1;' }, // duplicate content
        { path: 'file3.js', content: 'const b = 2;' },
        { path: 'file4.js', content: 'const a = 1;' }  // another duplicate
      ];

      const result = await stage.process(files, mockContext);

      expect(result).toHaveLength(2);
      expect(result.map(f => f.path)).toEqual(['file1.js', 'file3.js']);
    });

    it('should preserve files without content', async () => {
      const files = [
        { path: 'file1.js', content: 'content' },
        { path: 'file2.js' }, // no content
        { path: 'file3.js', content: null },
        { path: 'file4.js', content: 'content' } // duplicate
      ];

      const result = await stage.process(files, mockContext);

      expect(result).toHaveLength(3);
      expect(result.map(f => f.path)).toEqual(['file1.js', 'file2.js', 'file3.js']);
    });

    it('should emit deduplication events', async () => {
      const files = [
        { path: 'original.js', content: 'code' },
        { path: 'copy1.js', content: 'code' },
        { path: 'copy2.js', content: 'code' }
      ];

      await stage.process(files, mockContext);

      expect(mockContext.emit).toHaveBeenCalledWith('file:deduplicated', {
        original: 'original.js',
        duplicate: 'copy1.js'
      });
      expect(mockContext.emit).toHaveBeenCalledWith('file:deduplicated', {
        original: 'original.js',
        duplicate: 'copy2.js'
      });
    });

    it('should handle empty file list', async () => {
      const result = await stage.process([], mockContext);
      expect(result).toEqual([]);
    });

    it('should handle large files efficiently', async () => {
      const largeContent = 'x'.repeat(10000);
      const files = [
        { path: 'large1.js', content: largeContent },
        { path: 'large2.js', content: largeContent },
        { path: 'small.js', content: 'small' }
      ];

      const result = await stage.process(files, mockContext);

      expect(result).toHaveLength(2);
      expect(result.map(f => f.path)).toEqual(['large1.js', 'small.js']);
    });

    it('should compute consistent hashes', () => {
      const content = 'test content';
      const hash1 = crypto.createHash('md5').update(content).digest('hex');
      const hash2 = crypto.createHash('md5').update(content).digest('hex');
      
      expect(hash1).toBe(hash2);
    });

    it('should preserve metadata for kept files', async () => {
      const files = [
        { 
          path: 'file1.js', 
          content: 'unique',
          size: 100,
          mtime: new Date(),
          customProp: 'value'
        },
        { 
          path: 'file2.js', 
          content: 'unique', // duplicate
          size: 100,
          mtime: new Date()
        }
      ];

      const result = await stage.process(files, mockContext);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        path: 'file1.js',
        content: 'unique',
        size: 100,
        customProp: 'value'
      });
    });
  });

  describe('shouldApply', () => {
    it('should apply when dedupe option is true', () => {
      expect(stage.shouldApply(mockContext)).toBe(true);
    });

    it('should not apply when dedupe option is false', () => {
      mockContext.options.dedupe = false;
      expect(stage.shouldApply(mockContext)).toBe(false);
    });

    it('should not apply when dedupe option is not set', () => {
      mockContext.options = {};
      expect(stage.shouldApply(mockContext)).toBe(false);
    });
  });
});