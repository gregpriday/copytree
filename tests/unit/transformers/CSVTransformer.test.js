// Mock dependencies
jest.mock('fs-extra');

const CSVTransformer = require('../../../src/transforms/transformers/CSVTransformer');
const fs = require('fs-extra');

describe('CSVTransformer', () => {
  let transformer;

  beforeEach(() => {
    jest.clearAllMocks();
    transformer = new CSVTransformer();
  });

  describe('canTransform', () => {
    it('should transform CSV files', () => {
      expect(transformer.canTransform({ path: 'data.csv' })).toBe(true);
      expect(transformer.canTransform({ path: 'export.CSV' })).toBe(true);
    });

    it('should transform TSV files', () => {
      expect(transformer.canTransform({ path: 'data.tsv' })).toBe(true);
      expect(transformer.canTransform({ path: 'export.TSV' })).toBe(true);
    });

    it('should not transform non-CSV files', () => {
      expect(transformer.canTransform({ path: 'data.txt' })).toBe(false);
      expect(transformer.canTransform({ path: 'spreadsheet.xlsx' })).toBe(false);
      expect(transformer.canTransform({ path: 'script.js' })).toBe(false);
    });

    it('should handle files without extensions', () => {
      expect(transformer.canTransform({ path: 'README' })).toBeFalsy();
      expect(transformer.canTransform({ path: '' })).toBeFalsy();
    });
  });

  describe('doTransform', () => {
    it('should format simple CSV data', async () => {
      const file = {
        path: 'data.csv',
        content: 'Name,Age,City\nJohn,30,New York\nJane,25,Los Angeles\nBob,35,Chicago'
      };

      const result = await transformer.doTransform(file);

      expect(result.transformed).toBe(true);
      expect(result.transformedBy).toBe('CSVTransformer');
      // The actual implementation uses pipe-separated format
      expect(result.content).toContain('Name | Age | City');
      expect(result.content).toContain('-----+-----+----------');
      expect(result.content).toContain('John | 30  | New York');
      expect(result.content).toContain('Jane | 25  | Los Angeles');
      expect(result.content).toContain('Bob  | 35  | Chicago');
      expect(result.metadata).toEqual({
        totalRows: 3,
        displayedRows: 3,
        columns: 3,
        delimiter: ','
      });
    });

    it('should handle CSV with quotes', async () => {
      const file = {
        path: 'quoted.csv',
        content: 'Product,Description,Price\n"Widget A","A great widget, really!",19.99\n"Widget B","Another ""awesome"" widget",29.99'
      };

      const result = await transformer.doTransform(file);

      // Check for the actual formatted output
      expect(result.content).toContain('Product  | Description              | Price');
      expect(result.content).toContain('Widget A | A great widget, really!  | 19.99');
      expect(result.content).toContain('Widget B | Another "awesome" widget | 29.99');
    });

    it('should handle empty cells', async () => {
      const file = {
        path: 'sparse.csv',
        content: 'A,B,C\n1,,3\n,2,\n,,3'
      };

      const result = await transformer.doTransform(file);

      // Check for the actual formatted output
      expect(result.content).toContain('A | B | C');
      expect(result.content).toContain('1 |   | 3');
      expect(result.content).toContain('  | 2 |  ');
      expect(result.content).toContain('  |   | 3');
    });

    it('should preview large CSV files', async () => {
      const headers = 'Col1,Col2,Col3';
      const rows = [];
      for (let i = 1; i <= 100; i++) {
        rows.push(`Row${i}A,Row${i}B,Row${i}C`);
      }
      
      const file = {
        path: 'large.csv',
        content: headers + '\n' + rows.join('\n')
      };

      const result = await transformer.doTransform(file);

      expect(result.content).toContain('Col1');
      expect(result.content).toContain('Col2');
      expect(result.content).toContain('Col3');
      expect(result.content).toContain('Row1A');
      expect(result.content).toContain('Row1B');
      expect(result.content).toContain('Row1C');
      expect(result.content).toContain('Row10A');
      expect(result.content).toContain('Row10B');
      expect(result.content).toContain('Row10C');
      expect(result.content).not.toContain('Row11A'); // Should not show row 11
      expect(result.content).toContain('... (90 more rows)');
      expect(result.metadata.totalRows).toBe(100);
      expect(result.metadata.displayedRows).toBe(10);
    });

    it('should handle different delimiters', async () => {
      transformer = new CSVTransformer({ delimiter: ';' });
      
      const file = {
        path: 'semicolon.csv',
        content: 'Name;Age;Country\nAlice;28;USA\nBob;32;Canada'
      };

      const result = await transformer.doTransform(file);

      expect(result.content).toContain('Name  | Age | Country');
      expect(result.content).toContain('Alice | 28  | USA');
      expect(result.content).toContain('Bob   | 32  | Canada');
      expect(result.metadata.delimiter).toBe(';');
    });

    it('should auto-detect TSV files', async () => {
      const file = {
        path: 'data.tsv',
        content: 'Name\tAge\tCity\nJohn\t30\tBoston\nJane\t25\tSeattle'
      };

      const result = await transformer.doTransform(file);

      expect(result.content).toContain('Name | Age | City');
      expect(result.content).toContain('John | 30  | Boston');
      expect(result.content).toContain('Jane | 25  | Seattle');
      expect(result.metadata.delimiter).toBe('\t');
    });

    it('should handle empty CSV', async () => {
      const file = {
        path: 'empty.csv',
        content: ''
      };

      const result = await transformer.doTransform(file);

      expect(result.content).toBe('[Empty CSV file]');
      expect(result.metadata.totalRows).toBe(0);
    });

    it('should handle CSV with only headers', async () => {
      const file = {
        path: 'headers-only.csv',
        content: 'Column1,Column2,Column3'
      };

      const result = await transformer.doTransform(file);

      expect(result.content).toContain('Column1 | Column2 | Column3');
      expect(result.metadata.totalRows).toBe(0);
      expect(result.metadata.columns).toBe(3);
    });

    it('should load content from file if not provided', async () => {
      const fileContent = 'A,B\n1,2\n3,4';
      fs.readFile.mockResolvedValue(fileContent);
      
      const file = {
        path: 'from-disk.csv',
        absolutePath: '/project/from-disk.csv'
        // No content property
      };

      const result = await transformer.doTransform(file);

      expect(fs.readFile).toHaveBeenCalledWith('/project/from-disk.csv', 'utf8');
      expect(result.content).toContain('A | B');
      expect(result.content).toContain('1 | 2');
    });

    it('should handle parsing errors gracefully', async () => {
      // Mock the logger to avoid undefined error
      transformer.logger = { warn: jest.fn() };
      
      // Simulate a file that causes parsing error
      transformer.transformCSV = jest.fn().mockImplementation(() => {
        throw new Error('Invalid CSV format');
      });
      
      const file = {
        path: 'malformed.csv',
        content: 'A,B,C\n1,2\n3,4,5,6,7\n8,9,10'
      };

      const result = await transformer.doTransform(file);

      expect(result.transformed).toBe(true);
      expect(result.error).toBe('Invalid CSV format');
      expect(result.content).toContain('A,B,C'); // Raw content as fallback
      expect(result.content).toContain('1,2');
      expect(result.content).toContain('3,4,5,6,7');
      expect(result.content).toContain('8,9,10');
      // Since we have only 4 lines and maxRows is 10, no ellipsis is added
      expect(transformer.logger.warn).toHaveBeenCalled();
    });

    it('should handle special characters', async () => {
      const file = {
        path: 'special.csv',
        content: 'Symbol,Name,Price\n€,Euro,1.10\n£,Pound,1.25\n¥,Yen,0.0091'
      };

      const result = await transformer.doTransform(file);

      expect(result.content).toContain('€      | Euro  | 1.10');
      expect(result.content).toContain('£      | Pound | 1.25');
      expect(result.content).toContain('¥      | Yen   | 0.0091');
    });

    it('should truncate long cell values', async () => {
      const file = {
        path: 'long.csv',
        content: 'Short,VeryLongDescriptionThatExceedsTheMaximumWidth\nA,ThisIsAVeryLongValueThatShouldBeTruncatedToFitTheColumn'
      };

      const result = await transformer.doTransform(file);

      expect(result.content).toContain('...');
      expect(result.content).not.toContain('ThisIsAVeryLongValueThatShouldBeTruncatedToFitTheColumn');
    });
  });

  describe('detectDelimiter', () => {
    it('should detect comma delimiter', () => {
      const delimiter = transformer.detectDelimiter('a,b,c', 'test.csv');
      expect(delimiter).toBe(',');
    });

    it('should detect semicolon delimiter', () => {
      const delimiter = transformer.detectDelimiter('a;b;c', 'test.csv');
      expect(delimiter).toBe(';');
    });

    it('should detect tab delimiter from extension', () => {
      const delimiter = transformer.detectDelimiter('a,b,c', 'test.tsv');
      expect(delimiter).toBe('\t');
    });

    it('should use configured delimiter', () => {
      transformer = new CSVTransformer({ delimiter: '|' });
      const delimiter = transformer.detectDelimiter('a,b,c', 'test.csv');
      expect(delimiter).toBe('|');
    });

    it('should default to comma when unclear', () => {
      const delimiter = transformer.detectDelimiter('abc', 'test.csv');
      expect(delimiter).toBe(',');
    });
  });

  describe('parseCSVLine', () => {
    it('should parse simple line', () => {
      const parsed = transformer.parseCSVLine('a,b,c', ',');
      expect(parsed).toEqual(['a', 'b', 'c']);
    });

    it('should handle quoted fields', () => {
      const parsed = transformer.parseCSVLine('"a,b",c,"d"', ',');
      expect(parsed).toEqual(['a,b', 'c', 'd']);
    });

    it('should handle escaped quotes', () => {
      const parsed = transformer.parseCSVLine('"He said ""Hello"""', ',');
      expect(parsed).toEqual(['He said "Hello"']);
    });

    it('should trim whitespace', () => {
      const parsed = transformer.parseCSVLine(' a , b , c ', ',');
      expect(parsed).toEqual(['a', 'b', 'c']);
    });
  });

  describe('options', () => {
    it('should respect maxRows option', async () => {
      transformer = new CSVTransformer({ maxRows: 5 });
      
      const rows = [];
      for (let i = 1; i <= 20; i++) {
        rows.push(`Row${i}`);
      }
      
      const file = {
        path: 'limited.csv',
        content: 'Data\n' + rows.join('\n')
      };

      const result = await transformer.doTransform(file);

      expect(result.content).toContain('Row5');
      expect(result.content).not.toContain('Row6');
      expect(result.content).toContain('... (15 more rows)');
    });
  });
});