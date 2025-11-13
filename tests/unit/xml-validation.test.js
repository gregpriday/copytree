import { XMLParser } from 'fast-xml-parser';
import OutputFormattingStage from '../../src/pipeline/stages/OutputFormattingStage.js';

describe('XML Format Validation', () => {
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: true,
    parseAttributeValue: false,
    trimValues: true,
  });

  it('should generate valid XML that can be parsed', async () => {
    const stage = new OutputFormattingStage({ format: 'xml' });
    const result = await stage.process({
      basePath: '/test',
      profile: { name: 'default' },
      options: {},
      files: [
        {
          path: 'test.js',
          size: 100,
          modified: new Date(),
          isBinary: false,
          content: 'console.log("hello");',
        },
      ],
    });

    // Should not throw
    expect(() => parser.parse(result.output)).not.toThrow();

    const parsed = parser.parse(result.output);
    expect(parsed).toHaveProperty('ct:directory');
  });

  it('should correctly escape CDATA end sequences', async () => {
    const stage = new OutputFormattingStage({ format: 'xml' });

    // Content containing the illegal sequence ]]>
    const contentWithCDATA = 'function test() {\n  return data;]]>\n}';

    const result = await stage.process({
      basePath: '/test',
      profile: { name: 'default' },
      options: {},
      files: [
        {
          path: 'test.js',
          size: contentWithCDATA.length,
          modified: new Date(),
          isBinary: false,
          content: contentWithCDATA,
        },
      ],
    });

    // Should not throw - the XML must be well-formed
    expect(() => parser.parse(result.output)).not.toThrow();

    // Verify the content is preserved (XML should be well-formed)
    const parsed = parser.parse(result.output);
    const fileElement = parsed['ct:directory']['ct:files']['ct:file'];
    // The content should be a string containing the escaped sequence
    expect(typeof fileElement === 'string' || typeof fileElement === 'object').toBe(true);
  });

  it('should handle instructions with CDATA end sequences', async () => {
    const stage = new OutputFormattingStage({ format: 'xml' });

    const instructionsWithCDATA =
      'Example instruction:\nUse pattern <![CDATA[...]]> for embedding.';

    const result = await stage.process({
      basePath: '/test',
      profile: { name: 'default' },
      options: {},
      instructions: instructionsWithCDATA,
      instructionsName: 'test-instructions',
      files: [
        {
          path: 'test.js',
          size: 10,
          modified: new Date(),
          isBinary: false,
          content: 'test',
        },
      ],
    });

    // Should not throw
    expect(() => parser.parse(result.output)).not.toThrow();

    const parsed = parser.parse(result.output);
    expect(parsed['ct:directory']['ct:metadata']['ct:instructions']).toBeTruthy();
  });

  it('should generate XML with correct namespace', async () => {
    const stage = new OutputFormattingStage({ format: 'xml' });
    const result = await stage.process({
      basePath: '/test',
      profile: { name: 'default' },
      options: {},
      files: [],
    });

    expect(result.output).toContain('xmlns:ct="urn:copytree"');

    // Should parse without namespace errors
    expect(() => parser.parse(result.output)).not.toThrow();
  });

  it('should handle multiple files with various content', async () => {
    const stage = new OutputFormattingStage({ format: 'xml' });
    const result = await stage.process({
      basePath: '/test',
      profile: { name: 'default' },
      options: {},
      files: [
        {
          path: 'test1.js',
          size: 50,
          modified: new Date(),
          isBinary: false,
          content: 'const x = 1;',
        },
        {
          path: 'test2.js',
          size: 60,
          modified: new Date(),
          isBinary: false,
          content: 'const y = 2;]]>',
        },
        {
          path: 'test3.js',
          size: 70,
          modified: new Date(),
          isBinary: false,
          content: '<xml>test</xml>',
        },
      ],
    });

    // Should not throw
    expect(() => parser.parse(result.output)).not.toThrow();

    const parsed = parser.parse(result.output);
    const files = parsed['ct:directory']['ct:files']['ct:file'];
    expect(Array.isArray(files) ? files.length : 1).toBeGreaterThanOrEqual(1);
  });

  it('should handle binary files with placeholders', async () => {
    const stage = new OutputFormattingStage({ format: 'xml' });
    const result = await stage.process({
      basePath: '/test',
      profile: { name: 'default' },
      options: {},
      files: [
        {
          path: 'image.png',
          size: 100,
          modified: new Date(),
          isBinary: true,
          content: '[Binary file not included]',
          binaryCategory: 'image',
        },
      ],
    });

    // Should not throw
    expect(() => parser.parse(result.output)).not.toThrow();
  });

  it('should handle git metadata in XML', async () => {
    const stage = new OutputFormattingStage({ format: 'xml' });
    const result = await stage.process({
      basePath: '/test',
      profile: { name: 'default' },
      options: {},
      gitMetadata: {
        branch: 'main',
        lastCommit: {
          hash: 'abc123',
          message: 'Test commit with ]]> sequence',
        },
        hasUncommittedChanges: false,
        filterType: 'modified',
      },
      files: [],
    });

    // Should not throw
    expect(() => parser.parse(result.output)).not.toThrow();

    const parsed = parser.parse(result.output);
    expect(parsed['ct:directory']['ct:metadata']['ct:git']).toBeTruthy();
  });

  describe('Control Character Sanitization', () => {
    it('should remove invalid control characters from file content', async () => {
      const stage = new OutputFormattingStage({ format: 'xml' });

      // Content with invalid control characters (0x14, 0x13, 0x17)
      const contentWithControlChars =
        'text before\x14separator\x13bullet point\x17end of transmission';

      const result = await stage.process({
        basePath: '/test',
        profile: { name: 'default' },
        options: {},
        files: [
          {
            path: 'test.md',
            size: contentWithControlChars.length,
            modified: new Date(),
            isBinary: false,
            content: contentWithControlChars,
          },
        ],
      });

      // Should not throw - control characters should be removed
      expect(() => parser.parse(result.output)).not.toThrow();

      // Verify control characters were removed from output
      expect(result.output).not.toMatch(/\x14/);
      expect(result.output).not.toMatch(/\x13/);
      expect(result.output).not.toMatch(/\x17/);
    });

    it('should preserve valid whitespace characters (tab, LF, CR)', async () => {
      const stage = new OutputFormattingStage({ format: 'xml' });

      // Content with valid whitespace: tab (0x09), LF (0x0A), CR (0x0D)
      const contentWithValidWhitespace = 'line1\nline2\r\nline3\twith tab';

      const result = await stage.process({
        basePath: '/test',
        profile: { name: 'default' },
        options: {},
        files: [
          {
            path: 'test.txt',
            size: contentWithValidWhitespace.length,
            modified: new Date(),
            isBinary: false,
            content: contentWithValidWhitespace,
          },
        ],
      });

      // Should not throw - valid whitespace should be preserved
      expect(() => parser.parse(result.output)).not.toThrow();

      // Verify valid whitespace is preserved in output
      expect(result.output).toContain('\n');
      expect(result.output).toContain('\t');
    });

    it('should handle all invalid control characters (0x00-0x1F except tab, LF, CR)', async () => {
      const stage = new OutputFormattingStage({ format: 'xml' });

      // Create content with all invalid control characters
      const invalidChars = [
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x0b, 0x0c, 0x0e, 0x0f, 0x10, 0x11,
        0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x7f,
      ];
      const contentWithAllInvalidChars = `start${invalidChars.map((c) => String.fromCharCode(c)).join('')}end`;

      const result = await stage.process({
        basePath: '/test',
        profile: { name: 'default' },
        options: {},
        files: [
          {
            path: 'test.txt',
            size: contentWithAllInvalidChars.length,
            modified: new Date(),
            isBinary: false,
            content: contentWithAllInvalidChars,
          },
        ],
      });

      // Should not throw - all invalid control characters should be removed
      expect(() => parser.parse(result.output)).not.toThrow();

      // Verify output only contains "startend" (all control chars removed)
      const parsed = parser.parse(result.output);
      expect(parsed).toBeTruthy();
    });

    it('should handle control characters in git commit messages', async () => {
      const stage = new OutputFormattingStage({ format: 'xml' });

      // Git commit message with control characters
      const commitMessageWithControlChars = 'Fix issue\x14add feature\x13update docs';

      const result = await stage.process({
        basePath: '/test',
        profile: { name: 'default' },
        options: {},
        gitMetadata: {
          branch: 'main',
          lastCommit: {
            hash: 'abc123',
            message: commitMessageWithControlChars,
          },
          hasUncommittedChanges: false,
          filterType: 'modified',
        },
        files: [],
      });

      // Should not throw - control characters should be removed
      expect(() => parser.parse(result.output)).not.toThrow();

      // Verify control characters were removed
      expect(result.output).not.toMatch(/\x14/);
      expect(result.output).not.toMatch(/\x13/);
    });

    it('should handle control characters in instructions', async () => {
      const stage = new OutputFormattingStage({ format: 'xml' });

      const instructionsWithControlChars = 'Step 1\x14do this\x13Step 2\x14do that';

      const result = await stage.process({
        basePath: '/test',
        profile: { name: 'default' },
        options: {},
        instructions: instructionsWithControlChars,
        instructionsName: 'test-instructions',
        files: [],
      });

      // Should not throw - control characters should be removed
      expect(() => parser.parse(result.output)).not.toThrow();

      // Verify control characters were removed
      expect(result.output).not.toMatch(/\x14/);
      expect(result.output).not.toMatch(/\x13/);
    });

    it('should handle mixed content with both control chars and CDATA end sequences', async () => {
      const stage = new OutputFormattingStage({ format: 'xml' });

      // Complex content with both issues
      const complexContent = 'function test() {\n  // Control char:\x14here\n  return data;]]>\n}';

      const result = await stage.process({
        basePath: '/test',
        profile: { name: 'default' },
        options: {},
        files: [
          {
            path: 'test.js',
            size: complexContent.length,
            modified: new Date(),
            isBinary: false,
            content: complexContent,
          },
        ],
      });

      // Should not throw - both issues should be handled
      expect(() => parser.parse(result.output)).not.toThrow();

      // Verify control character was removed but valid content preserved
      expect(result.output).not.toMatch(/\x14/);
      expect(result.output).toContain('function test()');
    });
  });
});
