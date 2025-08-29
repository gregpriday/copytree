import BaseTransformer from '../BaseTransformer.js';
import fs from 'fs-extra';

/**
 * CSV transformer
 * Shows first N rows of CSV files with proper formatting
 */
class CSVTransformer extends BaseTransformer {
  constructor(options = {}) {
    super(options);
    this.description = 'Transforms CSV files by showing first N rows';
    this.supportedExtensions = ['.csv', '.tsv'];
    this.maxRows = options.maxRows || 10;
    this.delimiter = options.delimiter || null; // Auto-detect if null
  }

  async doTransform(file) {
    // Load content if not already loaded
    let content = file.content;

    if (content === undefined && file.absolutePath) {
      content = await fs.readFile(file.absolutePath, 'utf8');
    }

    if (content === undefined || content === null || typeof content !== 'string') {
      return {
        ...file,
        content: content || '',
        transformed: false,
        transformedBy: this.constructor.name,
      };
    }

    try {
      const transformed = this.transformCSV(content, file.path);

      return {
        ...file,
        content: transformed.content,
        originalContent: content,
        transformed: true,
        transformedBy: this.constructor.name,
        metadata: {
          totalRows: transformed.totalRows,
          displayedRows: transformed.displayedRows,
          columns: transformed.columns,
          delimiter: transformed.delimiter,
        },
      };
    } catch (error) {
      this.logger.warn(`Failed to parse CSV ${file.path}: ${error.message}`);

      // Return first N lines as fallback
      const allLines = content.split('\n');
      const lines = allLines.slice(0, this.maxRows);
      return {
        ...file,
        content: lines.join('\n') + (lines.length < allLines.length ? '\n...' : ''),
        originalContent: content,
        transformed: true,
        transformedBy: this.constructor.name,
        error: error.message,
      };
    }
  }

  /**
   * Transform CSV content
   * @param {string} content - CSV content
   * @param {string} filePath - File path (for extension detection)
   * @returns {Object} Transformed content and metadata
   */
  transformCSV(content, filePath = '') {
    const lines = content.split('\n').filter((line) => line.trim());

    if (lines.length === 0) {
      return {
        content: '[Empty CSV file]',
        totalRows: 0,
        displayedRows: 0,
        columns: 0,
        delimiter: null,
      };
    }

    // Detect delimiter
    const delimiter = this.detectDelimiter(lines[0], filePath);

    // Parse rows
    const rows = lines.map((line) => this.parseCSVLine(line, delimiter));
    const totalRows = rows.length;
    const displayRows = rows.slice(0, this.maxRows + 1); // +1 for header

    // Format as table
    const columnWidths = this.calculateColumnWidths(displayRows);
    const formattedRows = displayRows.map((row, index) =>
      this.formatRow(row, columnWidths, index === 0),
    );

    // Add separator after header
    if (formattedRows.length > 1) {
      const separator = columnWidths.map((width) => '-'.repeat(width)).join('-+-');
      formattedRows.splice(1, 0, separator);
    }

    // Add summary if truncated
    let output = formattedRows.join('\n');
    if (totalRows > this.maxRows + 1) {
      output += `\n\n... (${totalRows - this.maxRows - 1} more rows)`;
    }

    return {
      content: output,
      totalRows: totalRows - 1, // Exclude header
      displayedRows: Math.min(this.maxRows, totalRows - 1),
      columns: rows[0]?.length || 0,
      delimiter,
    };
  }

  /**
   * Detect CSV delimiter
   * @param {string} firstLine - First line of CSV
   * @param {string} filePath - File path
   * @returns {string} Detected delimiter
   */
  detectDelimiter(firstLine, filePath) {
    if (this.delimiter) return this.delimiter;

    // Check file extension
    if (filePath.toLowerCase().endsWith('.tsv')) {
      return '\t';
    }

    // Count occurrences of common delimiters
    const delimiters = [',', '\t', ';', '|'];
    const counts = delimiters.map((delim) => ({
      delimiter: delim,
      count: (firstLine.match(new RegExp(delim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || [])
        .length,
    }));

    // Return delimiter with highest count
    counts.sort((a, b) => b.count - a.count);
    return counts[0].count > 0 ? counts[0].delimiter : ',';
  }

  /**
   * Parse a CSV line
   * @param {string} line - CSV line
   * @param {string} delimiter - Delimiter
   * @returns {Array<string>} Parsed values
   */
  parseCSVLine(line, delimiter) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current.trim());
    return values;
  }

  /**
   * Calculate column widths for formatting
   * @param {Array<Array<string>>} rows - Parsed rows
   * @returns {Array<number>} Column widths
   */
  calculateColumnWidths(rows) {
    if (rows.length === 0) return [];

    const columnCount = Math.max(...rows.map((row) => row.length));
    const widths = new Array(columnCount).fill(0);

    rows.forEach((row) => {
      row.forEach((cell, index) => {
        widths[index] = Math.max(widths[index], cell.length);
      });
    });

    // Cap maximum width
    return widths.map((width) => Math.min(width, 30));
  }

  /**
   * Format a row for display
   * @param {Array<string>} row - Row values
   * @param {Array<number>} widths - Column widths
   * @param {boolean} isHeader - Whether this is the header row
   * @returns {string} Formatted row
   */
  formatRow(row, widths, isHeader) {
    const cells = row.map((cell, index) => {
      const width = widths[index] || 10;
      const truncated = cell.length > width ? cell.substring(0, width - 3) + '...' : cell;
      return truncated.padEnd(width);
    });

    return cells.join(' | ');
  }

  canTransform(file) {
    const ext = (file.path || '').toLowerCase().match(/\.[^.]+$/);
    return ext && this.supportedExtensions.includes(ext[0]);
  }
}

export default CSVTransformer;
