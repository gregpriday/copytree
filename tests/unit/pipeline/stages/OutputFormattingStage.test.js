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

describe('OutputFormattingStage - XML', () => {
  it('renders valid XML with files', async () => {
    await withTempDir('xml-basic', async (tempDir) => {
      const filePath = path.join(tempDir, 'index.js');
      await fs.writeFile(filePath, 'console.log("test");');

      const stage = new OutputFormattingStage({ format: 'xml' });
      const result = await stage.process({
        basePath: tempDir,
        profile: { name: 'default' },
        options: {},
        files: [
          {
            path: 'index.js',
            absolutePath: filePath,
            size: 20,
            modified: new Date(),
            isBinary: false,
            content: 'console.log("test");',
          },
        ],
      });

      const out = result.output;
      expect(out).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(out).toContain('<ct:directory');
      expect(out).toContain('xmlns:ct="urn:copytree"');
      expect(out).toContain('console.log("test");');
    });
  });
});

describe('OutputFormattingStage - JSON', () => {
  it('renders valid JSON with files', async () => {
    await withTempDir('json-basic', async (tempDir) => {
      const filePath = path.join(tempDir, 'data.txt');
      await fs.writeFile(filePath, 'sample data');

      const stage = new OutputFormattingStage({ format: 'json' });
      const result = await stage.process({
        basePath: tempDir,
        profile: { name: 'default' },
        options: {},
        files: [
          {
            path: 'data.txt',
            absolutePath: filePath,
            size: 11,
            modified: new Date('2024-01-01'),
            isBinary: false,
            content: 'sample data',
          },
        ],
      });

      const out = result.output;
      const parsed = JSON.parse(out);
      expect(parsed.files).toHaveLength(1);
      expect(parsed.files[0].path).toBe('data.txt');
      expect(parsed.files[0].content).toBe('sample data');
      expect(parsed.directory).toBeDefined();
    });
  });
});

describe('OutputFormattingStage - Tree', () => {
  it('renders tree structure', async () => {
    await withTempDir('tree-basic', async (tempDir) => {
      const filePath = path.join(tempDir, 'index.js');
      await fs.writeFile(filePath, 'code');

      const stage = new OutputFormattingStage({ format: 'tree' });
      const result = await stage.process({
        basePath: tempDir,
        profile: { name: 'default' },
        options: {},
        files: [
          {
            path: 'index.js',
            absolutePath: filePath,
            size: 4,
            modified: new Date(),
            isBinary: false,
            content: 'code',
          },
        ],
      });

      const out = result.output;
      expect(out).toContain('index.js');
      // Tree format should not include file contents
      expect(out).not.toContain('code');
    });
  });
});

describe('OutputFormattingStage - NDJSON', () => {
  it('renders newline-delimited JSON', async () => {
    await withTempDir('ndjson-basic', async (tempDir) => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'content');

      const stage = new OutputFormattingStage({ format: 'ndjson' });
      const result = await stage.process({
        basePath: tempDir,
        profile: { name: 'default' },
        options: {},
        files: [
          {
            path: 'test.txt',
            absolutePath: filePath,
            size: 7,
            modified: new Date(),
            isBinary: false,
            content: 'content',
          },
        ],
      });

      const out = result.output;
      const lines = out.trim().split('\n');
      expect(lines.length).toBeGreaterThan(0);

      // Each line should be valid JSON
      lines.forEach((line) => {
        expect(() => JSON.parse(line)).not.toThrow();
      });
    });
  });
});

describe('OutputFormattingStage - SARIF', () => {
  it('renders valid SARIF format', async () => {
    await withTempDir('sarif-basic', async (tempDir) => {
      const filePath = path.join(tempDir, 'app.js');
      await fs.writeFile(filePath, 'function test() {}');

      const stage = new OutputFormattingStage({ format: 'sarif' });
      const result = await stage.process({
        basePath: tempDir,
        profile: { name: 'default' },
        options: {},
        files: [
          {
            path: 'app.js',
            absolutePath: filePath,
            size: 18,
            modified: new Date(),
            isBinary: false,
            content: 'function test() {}',
          },
        ],
      });

      const out = result.output;
      const parsed = JSON.parse(out);
      expect(parsed.version).toBe('2.1.0');
      expect(parsed.$schema).toContain('sarif-2.1.0');
      expect(parsed.runs).toBeDefined();
      expect(Array.isArray(parsed.runs)).toBe(true);
    });
  });
});
