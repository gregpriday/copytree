// Unmock fs-extra for these tests
jest.unmock('fs-extra');

import fs from 'fs-extra';
import path from 'path';
import { withTempDir, settleFs } from '../../../helpers/tempfs.js';

let OutputFormattingStage;
let config;

beforeAll(async () => {
  const stageModule = await import('../../../../src/pipeline/stages/OutputFormattingStage.js');
  const cfgModule = await import('../../../../src/config/ConfigManager.js');
  OutputFormattingStage = stageModule.default;
  config = cfgModule.config;
});

describe('OutputFormattingStage - Markdown', () => {
  it('renders front matter, tree and one file with markers', async () => {
    await withTempDir('md-front-matter', async (tempDir) => {
      const filePath = path.join(tempDir, 'index.js');
      await fs.writeFile(filePath, 'console.log("hi");');

      const stage = new OutputFormattingStage({ format: 'markdown' });
      const result = await stage.process({
        basePath: tempDir,
        profile: { name: 'default' },
        options: {},
        files: [
          {
            path: 'index.js',
            absolutePath: filePath,
            size: 18,
            modified: new Date(),
            isBinary: false,
            content: 'console.log("hi");',
          },
        ],
      });

      const out = result.output;
      expect(out.startsWith('---')).toBe(true);
      expect(out).toContain('format: copytree-md@1');
      expect(out).toContain('# CopyTree Export');
      expect(out).toContain('## Directory Tree');
      expect(out).toMatch(/<!--\s*copytree:file-begin[^>]*-->/);
      expect(out).toMatch(/<!--\s*copytree:file-end\s+path="@index\.js"\s*-->/);
      expect(out).toContain('```js');
    });
  });

  it('uses longer fence when content contains backticks', async () => {
    await withTempDir('md-longer-fence', async (tempDir) => {
      const filePath = path.join(tempDir, 'README.md');
      await fs.writeFile(filePath, 'Here is code:\n```\nconsole.log(1)\n```');

      const stage = new OutputFormattingStage({ format: 'markdown' });
      const result = await stage.process({
        basePath: tempDir,
        profile: { name: 'default' },
        options: {},
        files: [
          {
            path: 'README.md',
            absolutePath: filePath,
            size: 32,
            modified: new Date(),
            isBinary: false,
            content: 'Here is code:\n```\nconsole.log(1)\n```',
          },
        ],
      });

      const out = result.output;
      // Look for a 4 backtick fence
      expect(out).toContain('````markdown');
    });
  });

  it('handles binary placeholder mode', async () => {
    await withTempDir('md-binary-placeholder', async (tempDir) => {
      // Configure placeholder
      config().set('copytree.binaryFileAction', 'placeholder');
      config().set('copytree.binaryPlaceholderText', '[Binary file not included]');

      const filePath = path.join(tempDir, 'image.png');
      await fs.writeFile(filePath, Buffer.from([1, 2, 3, 4]));

      const stage = new OutputFormattingStage({ format: 'markdown' });
      const result = await stage.process({
        basePath: tempDir,
        profile: { name: 'default' },
        options: {},
        files: [
          {
            path: 'image.png',
            absolutePath: filePath,
            size: 4,
            modified: new Date(),
            isBinary: true,
            content: '[Binary file not included]',
          },
        ],
      });

      const out = result.output;
      expect(out).toMatch(/binary=(\"?true\"?)/);
      expect(out).toContain('[Binary file not included]');
    });
  });

  it('handles binary base64 mode', async () => {
    await withTempDir('md-binary-base64', async (tempDir) => {
      // Configure base64
      config().set('copytree.binaryFileAction', 'base64');

      const filePath = path.join(tempDir, 'blob.bin');
      const data = Buffer.from('hello');
      await fs.writeFile(filePath, data);

      const stage = new OutputFormattingStage({ format: 'markdown' });
      const base64 = data.toString('base64');
      const result = await stage.process({
        basePath: tempDir,
        profile: { name: 'default' },
        options: {},
        files: [
          {
            path: 'blob.bin',
            absolutePath: filePath,
            size: data.length,
            modified: new Date(),
            isBinary: true,
            encoding: 'base64',
            content: base64,
          },
        ],
      });

      const out = result.output;
      expect(out).toContain('Content-Transfer: base64');
      expect(out).toContain(base64);
    });
  });

  it('adds line numbers when enabled', async () => {
    await withTempDir('md-line-numbers', async (tempDir) => {
      const stage = new OutputFormattingStage({ format: 'markdown', addLineNumbers: true });
      const filePath = path.join(tempDir, 'a.js');
      await fs.writeFile(filePath, 'a\nb');
      const result = await stage.process({
        basePath: tempDir,
        profile: { name: 'default' },
        options: { withLineNumbers: true },
        files: [
          {
            path: 'a.js',
            absolutePath: filePath,
            size: 3,
            modified: new Date(),
            isBinary: false,
            content: 'a\nb',
          },
        ],
      });
      const out = result.output;
      expect(out).toMatch(/\n\s*1\s*:/);
      expect(out).toMatch(/\n\s*2\s*:/);
    });
  });

  it('includes instructions with markers', async () => {
    await withTempDir('md-instructions', async (tempDir) => {
      const stage = new OutputFormattingStage({ format: 'markdown' });
      const filePath = path.join(tempDir, 'x.txt');
      await fs.writeFile(filePath, 'x');
      const result = await stage.process({
        basePath: tempDir,
        profile: { name: 'default' },
        options: { instructions: 'default' },
        instructions: 'Read carefully',
        instructionsName: 'default',
        files: [
          {
            path: 'x.txt',
            absolutePath: filePath,
            size: 1,
            modified: new Date(),
            isBinary: false,
            content: 'x',
          },
        ],
      });
      const out = result.output;
      expect(out).toContain('## Instructions');
      expect(out).toContain('<!-- copytree:instructions-begin');
      expect(out).toContain('<!-- copytree:instructions-end');
    });
  });

  it('emits truncation markers for truncated files', async () => {
    await withTempDir('md-truncation-markers', async (tempDir) => {
      const stage = new OutputFormattingStage({ format: 'markdown' });
      const filePath = path.join(tempDir, 'big.txt');
      await fs.writeFile(filePath, 'abcdefg');
      const result = await stage.process({
        basePath: tempDir,
        profile: { name: 'default' },
        options: {},
        files: [
          {
            path: 'big.txt',
            absolutePath: filePath,
            size: 7,
            modified: new Date(),
            isBinary: false,
            content: 'abc',
            originalLength: 7,
            truncated: true,
          },
        ],
      });
      const out = result.output;
      expect(out).toContain('copytree:truncated');
    });
  });
});
