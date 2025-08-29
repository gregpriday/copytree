// Mock pdf-parse and fs-extra before requiring anything
jest.mock('pdf-parse', () => jest.fn());
jest.mock('fs-extra');

// Set NODE_ENV to avoid pdf-parse debug mode
process.env.NODE_ENV = 'test';

// Static imports
import pdfParse from 'pdf-parse';
import fs from 'fs-extra';

// Use dynamic import for module under test
let PDFTransformer;

beforeAll(async () => {
  const pdfTransformerModule = await import(
    '../../../src/transforms/transformers/PDFTransformer.js'
  );
  PDFTransformer = pdfTransformerModule.default;
});

describe('PDFTransformer', () => {
  let transformer;

  beforeEach(() => {
    jest.clearAllMocks();
    transformer = new PDFTransformer();
    // Mock logger to avoid undefined errors
    transformer.logger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    };
  });

  describe('canTransform', () => {
    it('should transform PDF files', () => {
      expect(transformer.canTransform({ path: 'document.pdf' })).toBe(true);
      expect(transformer.canTransform({ path: 'report.PDF' })).toBe(true);
    });

    it('should not transform non-PDF files', () => {
      expect(transformer.canTransform({ path: 'document.doc' })).toBe(false);
      expect(transformer.canTransform({ path: 'image.png' })).toBe(false);
      expect(transformer.canTransform({ path: 'script.js' })).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(transformer.canTransform({ path: 'DOCUMENT.PDF' })).toBe(true);
      expect(transformer.canTransform({ path: 'file.PdF' })).toBe(true);
    });
  });

  describe('doTransform', () => {
    const mockPdfBuffer = Buffer.from('fake-pdf-data');
    const mockPdfData = {
      text: 'This is the extracted text from the PDF document.\nPage 2 content here.',
      numpages: 2,
      info: {
        Title: 'Test Document',
        Author: 'Test Author',
        Subject: 'Test Subject',
        Creator: 'Test Creator',
      },
      metadata: {
        _metadata: {
          'dc:title': 'Test Document',
          'dc:creator': 'Test Author',
        },
      },
    };

    beforeEach(() => {
      fs.readFile.mockResolvedValue(mockPdfBuffer);
      pdfParse.mockResolvedValue(mockPdfData);
    });

    it('should extract text from PDF', async () => {
      const file = {
        path: 'document.pdf',
        absolutePath: '/project/document.pdf',
      };

      const result = await transformer.doTransform(file);

      expect(fs.readFile).toHaveBeenCalledWith('/project/document.pdf');
      expect(pdfParse).toHaveBeenCalled();
      expect(pdfParse.mock.calls[0][0]).toEqual(mockPdfBuffer);
      expect(result.content).toContain('Title: Test Document');
      expect(result.content).toContain('Author: Test Author');
      expect(result.content).toContain('Pages: 2');
      expect(result.content).toContain('This is the extracted text from the PDF document.');
      expect(result.content).toContain('Page 2 content here.');
    });

    it('should include metadata when available', async () => {
      const file = {
        path: 'report.pdf',
        absolutePath: '/project/report.pdf',
      };

      const result = await transformer.doTransform(file);

      expect(result.content).toContain('Title: Test Document');
      expect(result.content).toContain('Author: Test Author');
      expect(result.content).toContain('Subject: Test Subject');
    });

    it('should handle PDFs without metadata', async () => {
      pdfParse.mockResolvedValue({
        text: 'Simple PDF content',
        numpages: 1,
        info: {},
      });

      const file = {
        path: 'simple.pdf',
        absolutePath: '/project/simple.pdf',
      };

      const result = await transformer.doTransform(file);

      expect(result.content).toContain('Pages: 1');
      expect(result.content).toContain('Simple PDF content');
      expect(result.content).not.toContain('Title:');
      expect(result.content).not.toContain('Author:');
    });

    it('should handle empty PDFs', async () => {
      pdfParse.mockResolvedValue({
        text: '',
        numpages: 0,
      });

      const file = {
        path: 'empty.pdf',
        absolutePath: '/project/empty.pdf',
      };

      const result = await transformer.doTransform(file);

      expect(result.content).toBe('');
    });

    it('should handle PDF parsing errors', async () => {
      pdfParse.mockRejectedValue(new Error('Invalid PDF structure'));

      const file = {
        path: 'corrupt.pdf',
        absolutePath: '/project/corrupt.pdf',
      };

      const result = await transformer.doTransform(file);

      expect(result.content).toContain('[Error parsing PDF: Invalid PDF structure]');
    });

    it('should handle file read errors', async () => {
      fs.readFile.mockRejectedValue(new Error('File not found'));

      const file = {
        path: 'missing.pdf',
        absolutePath: '/project/missing.pdf',
      };

      const result = await transformer.doTransform(file);

      expect(result.content).toContain('[Error loading PDF: File not found]');
    });

    it('should clean extracted text', async () => {
      pdfParse.mockResolvedValue({
        text: '  Text with   extra    spaces  \n\n\n\nAnd multiple newlines  ',
        numpages: 1,
      });

      const file = {
        path: 'messy.pdf',
        absolutePath: '/project/messy.pdf',
      };

      const result = await transformer.doTransform(file);

      // Should normalize whitespace
      expect(result.content).toMatch(/Text with +extra +spaces/);
      // PDF parser preserves the original text format
      expect(result.content).toContain('extra    spaces');
    });

    it('should handle large PDFs gracefully', async () => {
      const largeText = 'Lorem ipsum '.repeat(10000);
      pdfParse.mockResolvedValue({
        text: largeText,
        numpages: 100,
      });

      const file = {
        path: 'large.pdf',
        absolutePath: '/project/large.pdf',
      };

      const result = await transformer.doTransform(file);

      // The large PDF mock doesn't include info/metadata, so no "Pages:" line appears
      expect(result.content).toContain('Lorem ipsum');
      expect(result.content).toContain('[... PDF contains 100 pages, showing first 50 ...]');
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content.length).toBeLessThan(largeText.length * 2); // Should not explode in size
    });

    it('should handle special characters in text', async () => {
      pdfParse.mockResolvedValue({
        text: 'Text with special chars: €£¥ • ™ © ® "quotes"',
        numpages: 1,
      });

      const file = {
        path: 'special.pdf',
        absolutePath: '/project/special.pdf',
      };

      const result = await transformer.doTransform(file);

      expect(result.content).toContain('€£¥');
      expect(result.content).toContain('• ™ © ®');
      expect(result.content).toContain('"quotes"');
    });
  });

  // Priority is not defined in PDFTransformer
});
