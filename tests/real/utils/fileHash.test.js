import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { hashFile, hashContent } from '../../../src/utils/fileHash.js';
import { withTempDir } from '../../helpers/tempfs.js';

jest.unmock('../../../src/utils/fsx.js');

/**
 * Reference digest, computed independently of the implementation under test.
 * @param {Buffer|string} data - Content
 * @returns {string} Hex sha256
 */
function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

describe('hashFile', () => {
  // hashFile takes one of two routes depending on a size hint: small files are
  // read in one call, larger ones are streamed. Both have to produce the same
  // digest, or the `hash:` attribute in Markdown output would depend on how big
  // a file happened to be.

  it('produces the same digest whichever route it takes', async () => {
    await withTempDir('file-hash-routes', async (tmpDir) => {
      const target = path.join(tmpDir, 'content.txt');
      const content = Buffer.from('x'.repeat(300 * 1024));
      await fs.writeFile(target, content);

      const streamed = await hashFile(target, 'sha256');
      const hinted = await hashFile(target, 'sha256', { size: content.length });
      const inline = await hashFile(target, 'sha256', { size: 10 });

      expect(streamed).toBe(sha256(content));
      expect(hinted).toBe(streamed);
      expect(inline).toBe(streamed);
    });
  });

  it('streams a file above the inline ceiling', async () => {
    // Guards the branch that keeps a very large file from being pulled into
    // memory in one piece just to be hashed.
    await withTempDir('file-hash-large', async (tmpDir) => {
      const target = path.join(tmpDir, 'large.bin');
      const content = Buffer.alloc(512 * 1024, 0x61);
      await fs.writeFile(target, content);

      expect(await hashFile(target, 'sha256', { size: content.length })).toBe(sha256(content));
    });
  });

  it('streams when no size hint is given', async () => {
    await withTempDir('file-hash-no-hint', async (tmpDir) => {
      const target = path.join(tmpDir, 'plain.txt');
      await fs.writeFile(target, 'hello');

      expect(await hashFile(target)).toBe(sha256('hello'));
    });
  });

  it('rejects when the file cannot be read', async () => {
    await expect(hashFile('/nonexistent/definitely/missing.txt')).rejects.toThrow();
  });

  it('hashes in-memory content consistently with file content', async () => {
    await withTempDir('file-hash-content', async (tmpDir) => {
      const target = path.join(tmpDir, 'same.txt');
      await fs.writeFile(target, 'identical bytes');

      expect(hashContent('identical bytes')).toBe(await hashFile(target, 'sha256', { size: 15 }));
    });
  });
});
