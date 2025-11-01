import SARIFFormatter from '../../src/pipeline/formatters/SARIFFormatter.js';
import OutputFormattingStage from '../../src/pipeline/stages/OutputFormattingStage.js';

describe('SARIF Formatter', () => {
  // Mock stage for formatter tests
  const createMockStage = () => ({
    calculateTotalSize: (files) => files.reduce((sum, f) => sum + (f?.size || 0), 0),
    addLineNumbersToContent: (content) => {
      return content
        .split('\n')
        .map((line, i) => `${String(i + 1).padStart(4)}: ${line}`)
        .join('\n');
    },
    config: {
      get: (key, defaultValue) => defaultValue,
    },
  });

  describe('format()', () => {
    it('should generate valid SARIF v2.1.0 structure', async () => {
      const stage = createMockStage();
      const formatter = new SARIFFormatter({ stage });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        version: '1.0.0',
        files: [
          {
            path: 'test.js',
            size: 100,
            modified: new Date('2024-01-15T10:30:00Z'),
            isBinary: false,
            content: 'console.log("hello");\n',
          },
        ],
      };

      const output = await formatter.format(input);
      const sarif = JSON.parse(output);

      // Validate SARIF schema reference
      expect(sarif.$schema).toBe('https://json.schemastore.org/sarif-2.1.0.json');
      expect(sarif.version).toBe('2.1.0');

      // Validate runs array
      expect(sarif.runs).toBeDefined();
      expect(Array.isArray(sarif.runs)).toBe(true);
      expect(sarif.runs.length).toBe(1);

      const run = sarif.runs[0];

      // Validate tool driver
      expect(run.tool.driver.name).toBe('CopyTree');
      expect(run.tool.driver.version).toBe('1.0.0');
      expect(run.tool.driver.informationUri).toBe('https://copytree.dev');

      // Validate rules
      expect(run.tool.driver.rules).toBeDefined();
      expect(run.tool.driver.rules.length).toBe(1);
      expect(run.tool.driver.rules[0].id).toBe('file-discovered');
    });

    it('should include results for each file', async () => {
      const stage = createMockStage();
      const formatter = new SARIFFormatter({ stage });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        files: [
          {
            path: 'a.js',
            size: 10,
            isBinary: false,
            content: 'a\n',
          },
          {
            path: 'b.js',
            size: 20,
            isBinary: false,
            content: 'b\nb\n',
          },
        ],
      };

      const output = await formatter.format(input);
      const sarif = JSON.parse(output);
      const results = sarif.runs[0].results;

      expect(results.length).toBe(2);

      // Validate first result
      expect(results[0].ruleId).toBe('file-discovered');
      expect(results[0].level).toBe('note');
      expect(results[0].message.text).toContain('a.js');
      expect(results[0].locations[0].physicalLocation.artifactLocation.uri).toBe('a.js');

      // Validate second result
      expect(results[1].locations[0].physicalLocation.artifactLocation.uri).toBe('b.js');
    });

    it('should include line regions for files with content', async () => {
      const stage = createMockStage();
      const formatter = new SARIFFormatter({ stage });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        files: [
          {
            path: 'test.js',
            size: 50,
            isBinary: false,
            content: 'line1\nline2\nline3\n',
          },
        ],
      };

      const output = await formatter.format(input);
      const sarif = JSON.parse(output);
      const result = sarif.runs[0].results[0];
      const region = result.locations[0].physicalLocation.region;

      expect(region).toBeDefined();
      expect(region.startLine).toBe(1);
      expect(region.endLine).toBe(4); // 3 lines + 1 empty line from trailing newline
    });

    it('should not include regions for binary files', async () => {
      const stage = createMockStage();
      const formatter = new SARIFFormatter({ stage });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        files: [
          {
            path: 'image.png',
            size: 500,
            isBinary: true,
            content: '[Binary file]',
          },
        ],
      };

      const output = await formatter.format(input);
      const sarif = JSON.parse(output);
      const result = sarif.runs[0].results[0];
      const region = result.locations[0].physicalLocation.region;

      expect(region).toBeUndefined();
    });

    it('should include file properties', async () => {
      const stage = createMockStage();
      const formatter = new SARIFFormatter({ stage });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        files: [
          {
            path: 'test.js',
            size: 100,
            modified: '2024-01-15T10:30:00Z',
            isBinary: false,
            encoding: 'utf8',
            content: 'test',
          },
        ],
      };

      const output = await formatter.format(input);
      const sarif = JSON.parse(output);
      const result = sarif.runs[0].results[0];

      expect(result.properties.size).toBe(100);
      expect(result.properties.modified).toBe('2024-01-15T10:30:00Z');
      expect(result.properties.isBinary).toBe(false);
      expect(result.properties.encoding).toBe('utf8');
    });

    it('should include git metadata in run properties', async () => {
      const stage = createMockStage();
      const formatter = new SARIFFormatter({ stage });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        gitMetadata: {
          branch: 'main',
          lastCommit: {
            hash: 'abc123',
            message: 'Test commit',
          },
          hasUncommittedChanges: true,
        },
        files: [],
      };

      const output = await formatter.format(input);
      const sarif = JSON.parse(output);
      const runProps = sarif.runs[0].properties;

      expect(runProps.git).toBeDefined();
      expect(runProps.git.branch).toBe('main');
      expect(runProps.git.lastCommit.hash).toBe('abc123');
      expect(runProps.git.lastCommit.message).toBe('Test commit');
      expect(runProps.git.hasUncommittedChanges).toBe(true);
    });

    it('should include profile and file count in run properties', async () => {
      const stage = createMockStage();
      const formatter = new SARIFFormatter({ stage });

      const input = {
        basePath: '/test',
        profile: { name: 'custom-profile' },
        files: [
          { path: 'a.js', size: 10, isBinary: false },
          { path: 'b.js', size: 20, isBinary: false },
        ],
      };

      const output = await formatter.format(input);
      const sarif = JSON.parse(output);
      const runProps = sarif.runs[0].properties;

      expect(runProps.profile).toBe('custom-profile');
      expect(runProps.fileCount).toBe(2);
      expect(runProps.totalSize).toBe(30);
    });

    it('should include invocations with working directory', async () => {
      const stage = createMockStage();
      const formatter = new SARIFFormatter({ stage });

      const input = {
        basePath: '/test/project',
        profile: { name: 'default' },
        files: [],
      };

      const output = await formatter.format(input);
      const sarif = JSON.parse(output);
      const invocations = sarif.runs[0].invocations;

      expect(invocations).toBeDefined();
      expect(invocations.length).toBe(1);
      expect(invocations[0].executionSuccessful).toBe(true);
      expect(invocations[0].endTimeUtc).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(invocations[0].workingDirectory.uri).toBe('file:///test/project');
    });

    it('should handle git status in file properties', async () => {
      const stage = createMockStage();
      const formatter = new SARIFFormatter({ stage });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        files: [
          {
            path: 'modified.js',
            size: 100,
            isBinary: false,
            gitStatus: 'M',
            content: 'code',
          },
        ],
      };

      const output = await formatter.format(input);
      const sarif = JSON.parse(output);
      const result = sarif.runs[0].results[0];

      expect(result.properties.gitStatus).toBe('M');
    });

    it('should handle binary categories', async () => {
      const stage = createMockStage();
      const formatter = new SARIFFormatter({ stage });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        files: [
          {
            path: 'image.png',
            size: 500,
            isBinary: true,
            binaryCategory: 'image',
            content: '[Binary]',
          },
        ],
      };

      const output = await formatter.format(input);
      const sarif = JSON.parse(output);
      const result = sarif.runs[0].results[0];

      expect(result.properties.binaryCategory).toBe('image');
    });

    it('should handle truncated files', async () => {
      const stage = createMockStage();
      const formatter = new SARIFFormatter({ stage });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        files: [
          {
            path: 'large.js',
            size: 1000,
            isBinary: false,
            content: 'truncated',
            truncated: true,
            originalLength: 5000,
          },
        ],
      };

      const output = await formatter.format(input);
      const sarif = JSON.parse(output);
      const result = sarif.runs[0].results[0];

      expect(result.properties.truncated).toBe(true);
      expect(result.properties.originalLength).toBe(5000);
    });

    it('should use uriBaseId for relative paths', async () => {
      const stage = createMockStage();
      const formatter = new SARIFFormatter({ stage });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        files: [
          {
            path: 'src/index.js',
            size: 100,
            isBinary: false,
            content: 'code',
          },
        ],
      };

      const output = await formatter.format(input);
      const sarif = JSON.parse(output);
      const result = sarif.runs[0].results[0];
      const location = result.locations[0].physicalLocation.artifactLocation;

      expect(location.uri).toBe('src/index.js');
      expect(location.uriBaseId).toBe('%SRCROOT%');
    });

    it('should filter out null files', async () => {
      const stage = createMockStage();
      const formatter = new SARIFFormatter({ stage });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        files: [
          { path: 'a.js', size: 10, isBinary: false, content: 'a' },
          null,
          { path: 'b.js', size: 20, isBinary: false, content: 'b' },
        ],
      };

      const output = await formatter.format(input);
      const sarif = JSON.parse(output);
      const results = sarif.runs[0].results;

      expect(results.length).toBe(2);
      expect(sarif.runs[0].properties.fileCount).toBe(2);
    });

    it('should pretty-print JSON by default', async () => {
      const stage = createMockStage();
      const formatter = new SARIFFormatter({ stage });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        files: [],
      };

      const output = await formatter.format(input);

      // Pretty-printed JSON should have newlines and indentation
      expect(output).toContain('\n');
      expect(output).toContain('  ');
    });

    it('should respect onlyTree option', async () => {
      const stage = createMockStage();
      const formatter = new SARIFFormatter({ stage, onlyTree: true });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        files: [
          {
            path: 'test.js',
            size: 100,
            isBinary: false,
            content: 'should not count lines',
          },
        ],
      };

      const output = await formatter.format(input);
      const sarif = JSON.parse(output);
      const result = sarif.runs[0].results[0];

      // Should not have region when onlyTree is true
      expect(result.locations[0].physicalLocation.region).toBeUndefined();
    });

    it('should use package version if input.version not provided', async () => {
      const stage = createMockStage();
      const formatter = new SARIFFormatter({ stage });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        files: [],
      };

      const output = await formatter.format(input);
      const sarif = JSON.parse(output);

      // Should have some version (from package.json)
      expect(sarif.runs[0].tool.driver.version).toBeDefined();
      expect(sarif.runs[0].tool.driver.version).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe('Integration with OutputFormattingStage', () => {
    it('should work through OutputFormattingStage', async () => {
      const stage = new OutputFormattingStage({ format: 'sarif' });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        files: [
          {
            path: 'test.js',
            size: 100,
            isBinary: false,
            content: 'test',
          },
        ],
      };

      const result = await stage.process(input);

      expect(result.outputFormat).toBe('sarif');
      expect(result.output).toBeDefined();
      expect(result.outputSize).toBeGreaterThan(0);

      // Validate SARIF structure
      const sarif = JSON.parse(result.output);
      expect(sarif.version).toBe('2.1.0');
      expect(sarif.$schema).toBe('https://json.schemastore.org/sarif-2.1.0.json');
    });
  });

  describe('SARIF Compliance', () => {
    it('should have all required SARIF v2.1.0 root properties', async () => {
      const stage = createMockStage();
      const formatter = new SARIFFormatter({ stage });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        files: [],
      };

      const output = await formatter.format(input);
      const sarif = JSON.parse(output);

      // Required root properties
      expect(sarif.$schema).toBeDefined();
      expect(sarif.version).toBeDefined();
      expect(sarif.runs).toBeDefined();
    });

    it('should have all required run properties', async () => {
      const stage = createMockStage();
      const formatter = new SARIFFormatter({ stage });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        files: [],
      };

      const output = await formatter.format(input);
      const sarif = JSON.parse(output);
      const run = sarif.runs[0];

      // Required run properties
      expect(run.tool).toBeDefined();
      expect(run.results).toBeDefined();
    });

    it('should have all required tool.driver properties', async () => {
      const stage = createMockStage();
      const formatter = new SARIFFormatter({ stage });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        files: [],
      };

      const output = await formatter.format(input);
      const sarif = JSON.parse(output);
      const driver = sarif.runs[0].tool.driver;

      // Required driver properties
      expect(driver.name).toBeDefined();
      expect(driver.informationUri).toBeDefined();
    });
  });
});
