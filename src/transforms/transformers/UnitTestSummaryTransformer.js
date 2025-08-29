import BaseTransformer from '../BaseTransformer.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';

/**
 * Unit test summary transformer using Gemini API
 * Generates summaries specifically for test files
 */
class UnitTestSummaryTransformer extends BaseTransformer {
  constructor(options = {}) {
    super(options);
    this.description = 'Generate AI-powered summaries of unit test files';
    this.testPatterns = options.testPatterns || [
      '**/*.test.js',
      '**/*.spec.js',
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/*_test.py',
      '**/test_*.py',
      '**/*Test.java',
      '**/*Spec.rb',
      '**/*.test.php',
    ];
    this.maxFileSize = options.maxFileSize || 100 * 1024; // 100KB default
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY;

    if (!this.apiKey) {
      this.logger.warn('No Gemini API key provided, test summaries will be disabled');
    } else {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
      this.model = this.genAI.getGenerativeModel({
        model: options.model || this.config.get('ai.gemini.model'),
      });
    }

    this.isHeavy = true; // AI test analysis is a heavy operation
  }

  /**
   * Check if this transformer can handle the file
   */
  canTransform(file) {
    if (!this.apiKey) return false;

    // Check if it's a test file
    const isTestFile = this.isTestFile(file.path);
    if (!isTestFile) return false;

    // Check file size
    const size = file.stats?.size || Buffer.byteLength(file.content);
    return size <= this.maxFileSize;
  }

  /**
   * Check if file is a test file
   */
  isTestFile(filePath) {
    const filename = path.basename(filePath).toLowerCase();
    const patterns = [
      /\.test\.[jt]sx?$/,
      /\.spec\.[jt]sx?$/,
      /_test\.py$/,
      /^test_.*\.py$/,
      /Test\.(java|cs|php)$/,
      /Spec\.(rb|scala)$/,
      /test\.go$/,
    ];

    return patterns.some((pattern) => pattern.test(filename));
  }

  /**
   * Transform test file to summary
   */
  async doTransform(file) {
    try {
      // Get content as string
      const content = Buffer.isBuffer(file.content)
        ? file.content.toString('utf8')
        : String(file.content);

      // Extract test information
      const testInfo = this.extractTestInfo(content, file.path);

      // Truncate content if too long
      const maxLength = 8000; // Roughly 2000 tokens
      const truncatedContent =
        content.length > maxLength
          ? content.substring(0, maxLength) + '\n... (truncated)'
          : content;

      // Generate summary using Gemini
      const prompt = `Analyze this unit test file and provide a concise summary.

Test file: ${path.basename(file.path)}
Detected framework: ${testInfo.framework || 'Unknown'}
Number of test cases: ${testInfo.testCount || 'Unknown'}

Content:
${truncatedContent}

Please provide:
1. What component/module is being tested
2. Main test scenarios covered (as bullet points)
3. Key assertions or expectations
4. Any notable test patterns or helpers used

Keep the summary concise (3-5 sentences plus bullet points for scenarios).`;

      const result = await this.model.generateContent(prompt);
      const summary = result.response.text();

      return {
        ...file,
        content: this.formatOutput(file, summary, testInfo),
        transformed: true,
        transformedBy: this.constructor.name,
        metadata: {
          ...testInfo,
          originalSize: content.length,
          truncated: content.length > maxLength,
          model: this.model.model,
        },
      };
    } catch (error) {
      this.logger.error('Failed to generate test summary', {
        file: file.path,
        error: error.message,
      });

      // Return basic test info on error
      const testInfo = this.extractTestInfo(file.content.toString(), file.path);
      return {
        ...file,
        content: this.formatBasicSummary(file, testInfo),
        transformed: true,
        transformedBy: this.constructor.name,
        metadata: {
          ...testInfo,
          error: error.message,
        },
      };
    }
  }

  /**
   * Extract basic test information from content
   */
  extractTestInfo(content, filePath) {
    const info = {
      framework: null,
      testCount: 0,
      describeBlocks: 0,
      hasSetup: false,
      hasTeardown: false,
    };

    // Detect testing framework
    if (/import.*@testing-library/.test(content)) {
      info.framework = 'React Testing Library';
    } else if (/from jest/.test(content) || /describe\(|test\(|it\(/.test(content)) {
      info.framework = 'Jest';
    } else if (/import.*mocha|describe\(|it\(/.test(content)) {
      info.framework = 'Mocha';
    } else if (/import unittest|class.*TestCase/.test(content)) {
      info.framework = 'Python unittest';
    } else if (/import pytest|def test_/.test(content)) {
      info.framework = 'Pytest';
    } else if (/import org\.junit|@Test/.test(content)) {
      info.framework = 'JUnit';
    } else if (/RSpec\.describe|describe.*do/.test(content)) {
      info.framework = 'RSpec';
    }

    // Count test cases (rough estimate)
    const testPatterns = [/\bit\(/g, /\btest\(/g, /\bdef test_/g, /@Test/g, /\bscenario\(/g];

    for (const pattern of testPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        info.testCount += matches.length;
      }
    }

    // Count describe blocks
    const describeMatches = content.match(/\bdescribe\(/g);
    if (describeMatches) {
      info.describeBlocks = describeMatches.length;
    }

    // Check for setup/teardown
    info.hasSetup = /beforeEach|beforeAll|setUp|@Before|before\(/.test(content);
    info.hasTeardown = /afterEach|afterAll|tearDown|@After|after\(/.test(content);

    return info;
  }

  /**
   * Format basic summary when AI fails
   */
  formatBasicSummary(file, testInfo) {
    const filename = path.basename(file.path);
    let summary = `[Test File: ${filename}]\n\n`;

    summary += `Framework: ${testInfo.framework || 'Unknown'}\n`;
    summary += `Test cases: ${testInfo.testCount || 0}\n`;

    if (testInfo.describeBlocks > 0) {
      summary += `Test suites: ${testInfo.describeBlocks}\n`;
    }

    if (testInfo.hasSetup || testInfo.hasTeardown) {
      summary += `Setup/Teardown: ${testInfo.hasSetup ? '✓' : '✗'} / ${testInfo.hasTeardown ? '✓' : '✗'}\n`;
    }

    summary += '\n[AI summary generation failed]';

    return summary;
  }

  /**
   * Format the output
   */
  formatOutput(file, summary, testInfo) {
    const filename = path.basename(file.path);
    let header = `[Test Summary: ${filename}]\n`;

    if (testInfo.framework) {
      header += `Framework: ${testInfo.framework} | `;
    }

    header += `Tests: ${testInfo.testCount || '?'}\n\n`;

    return header + summary.trim() + `\n\n[AI-generated test summary by ${this.constructor.name}]`;
  }
}

export default UnitTestSummaryTransformer;
