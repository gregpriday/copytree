# Transformer Reference

Transformers process files to extract, convert, or enhance their content. This reference covers all available transformers and their configuration options.

> **📘 Note**: Transformers are configured **in profiles only**, not via CLI flags.

## Overview

Transformers are applied to files during the copy process to:
- Extract text from binary formats (PDFs, images)
- Convert between formats (Markdown to HTML)
- Summarize large files with AI
- Extract metadata and structure
- Optimize content for AI consumption

## Enabling Transformers

Transformers are configured in profiles only. There are no CLI flags to enable or disable transformers.

### In Profiles

```yaml
transformers:
  pdf:
    enabled: true
    options:
      maxPages: 20

  markdown:
    enabled: true
    options:
      mode: strip
```

Then use the profile:

```bash
copytree --profile myprofile
```

## Available Transformers

### 1. File Loader (Default)

The default transformer that loads file content without modification.

**Name**: `file-loader`

**Options**:
```yaml
transformers:
  file-loader:
    enabled: true
    options:
      encoding: utf8  # Character encoding
```

**Use Cases**:
- Default file reading
- Preserving original content
- Binary file handling

### 2. PDF to Text

Extracts text content from PDF files.

**Name**: `pdf`

**Options**:
```yaml
transformers:
  pdf:
    enabled: true
    options:
      maxPages: 50           # Maximum pages to extract
      includeMetadata: true  # Include document metadata
```

**Features**:
- Text extraction from PDFs
- Metadata extraction (title, author, dates)
- Page limiting for large documents
- Handles encrypted PDFs (if readable)

**Example Output**:
```
[PDF Metadata]
Title: Software Architecture Guide
Author: John Doe
Pages: 125
Created: 2024-01-15

[Content]
Page 1:
Introduction to Software Architecture...
```

### 3. Image OCR

Extracts text from images using optical character recognition.

**Name**: `image`

**Options**:
```yaml
transformers:
  image:
    enabled: true
    options:
      enableOCR: true        # Enable OCR
      language: eng          # OCR language
      includeMetadata: true  # Include image metadata
```

**Use Cases**:
- Screenshots with text
- Scanned documents
- Diagrams with labels
- Error message screenshots

### 4. CSV Formatter

Formats CSV/TSV files as readable tables.

**Name**: `csv`

**Options**:
```yaml
transformers:
  csv:
    enabled: true
    options:
      maxRows: 10        # Number of rows to show
      delimiter: null    # Auto-detect or specify
```

**Features**:
- Auto-detects delimiters
- Formats as ASCII table
- Handles quoted values
- Shows row count summary

**Example Output**:
```
┌─────┬──────────┬─────────┬────────┐
│ ID  │ Name     │ Email   │ Status │
├─────┼──────────┼─────────┼────────┤
│ 1   │ John Doe │ john@.. │ Active │
│ 2   │ Jane Doe │ jane@.. │ Active │
└─────┴──────────┴─────────┴────────┘
[Showing 2 of 150 total rows]
```

### 5. Markdown Processor

Transforms markdown files by stripping or converting formatting.

**Name**: `markdown`

**Options**:
```yaml
transformers:
  markdown:
    enabled: true
    options:
      mode: strip  # 'strip' or 'html'
```

**Modes**:
- `strip`: Remove all markdown formatting
- `html`: Convert to HTML

**Use Cases**:
- Clean text extraction
- Documentation processing
- README files

### 6. First Lines

Extracts the first N lines from text files.

**Name**: `first-lines`

**Options**:
```yaml
transformers:
  first-lines:
    enabled: true
    options:
      lineCount: 20          # Lines to extract
      includeLineNumbers: false  # Add line numbers
      skipEmptyLines: false     # Skip empty lines
```

**Use Cases**:
- Large log files
- Preview of long documents
- Quick file inspection

### 7. Document to Text

Converts various document formats to plain text.

**Name**: `document-to-text`

**Options**:
```yaml
transformers:
  document-to-text:
    enabled: true
    options:
      preserveFormatting: false
```

**Supported Formats**:
- Microsoft Word (.doc, .docx)
- OpenDocument (.odt)
- Rich Text (.rtf)
- And more (requires Pandoc)

### 8. HTML Stripper

Removes HTML tags from content.

**Name**: `html-stripper`

**Options**:
```yaml
transformers:
  html-stripper:
    enabled: true
    options:
      preserveLinks: false  # Keep link URLs
```

**Use Cases**:
- Web page content extraction
- Email template processing
- HTML documentation

### 9. Markdown Link Stripper

Removes links from markdown files.

**Name**: `markdown-link-stripper`

**Options**:
```yaml
transformers:
  markdown-link-stripper:
    enabled: true
    options:
      preserveText: true  # Keep link text
```

### 10. Streaming File Loader

Streams large files (>10MB) for memory-efficient processing.

**Name**: `streaming-file-loader`

**Options**:
```yaml
transformers:
  streaming-file-loader:
    enabled: true
    options:
      chunkSize: 1048576  # Chunk size in bytes (default: 1MB)
```

**Use Cases**:
- Large log files
- Large text files
- Memory-constrained environments

**Note**: Automatically used for files exceeding the configured file size threshold.

### 11. Binary Handler

Handles binary files with configurable behavior.

**Name**: `binary`

**Options**:
```yaml
transformers:
  binary:
    enabled: true
    options:
      mode: placeholder  # 'placeholder', 'base64', or 'skip'
```

## Configuration Examples

### Profile with Multiple Transformers

```yaml
name: documentation
description: Process documentation with transformers

transformers:
  # Extract text from PDFs
  pdf:
    enabled: true
    options:
      maxPages: 100

  # Process markdown
  markdown:
    enabled: true
    options:
      mode: strip

  # Format CSV files
  csv:
    enabled: true
    options:
      maxRows: 20
```

### Selective Transformation

Apply transformers to specific patterns:

```yaml
rules:
  - include: "docs/**/*.pdf"
    transform: pdf

  - include: "screenshots/**/*.png"
    transform: image
    transform_options:
      enableOCR: true

  - include: "src/**/*.md"
    transform: markdown
    transform_options:
      mode: strip
```

### Performance Optimization

```yaml
transformers:
  # Limit expensive operations
  pdf:
    enabled: true
    options:
      maxPages: 10  # First 10 pages only

  image:
    enabled: true
    options:
      enableOCR: true

  first-lines:
    enabled: true
    options:
      lineCount: 20  # Limit preview length
```

## Best Practices

### 1. Choose Appropriate Transformers

```yaml
# For code documentation
transformers:
  markdown:
    enabled: true
  first-lines:
    enabled: true

# For documentation
transformers:
  pdf:
    enabled: true
  document-to-text:
    enabled: true

# For visual assets
transformers:
  image:
    enabled: true
```

### 2. Set Reasonable Limits

```yaml
transformers:
  pdf:
    options:
      maxPages: 50  # Avoid huge documents

  first-lines:
    options:
      lineCount: 50  # Limit preview
```

### 3. Test Transformer Output

```bash
# Test with profile that has transformers enabled
copytree --profile myprofile --dry-run --verbose

# Check transformation results
copytree --profile myprofile --display | less
```

## Troubleshooting

### Transformer Not Working

**Check if enabled**:
```yaml
transformers:
  pdf:
    enabled: true  # Must be true
```

**Verify dependencies**:
- PDF: Requires `pdf-parse` package
- Images: Requires `tesseract.js` for OCR
- Documents: Requires Pandoc installed

### Performance Issues

**Limit transformer scope**:
```yaml
# Only transform specific files
rules:
  - include: "docs/**/*.pdf"
    transform: pdf

  - include: "**/*.pdf"
    transform: false  # Skip others
```

### Output Too Large

**Adjust transformer options**:
```yaml
transformers:
  first-lines:
    options:
      lineCount: 10  # Reduce lines
      
  csv:
    options:
      maxRows: 5  # Fewer rows
```

## Transformer Validation and Optimization

CopyTree includes an advanced transformer traits system that provides validation and optimization for transformer sequences:

### Plan Validation

The system can validate transformer combinations to detect:

- **Conflicts** between incompatible transformers
- **Resource requirements** (API keys, network access)
- **Type incompatibilities** (binary output → text-only input)
- **Performance issues** (too many heavy operations)

### Automatic Optimization

The system can optimize transformer execution order by:

- Moving order-sensitive transformers to appropriate positions
- Placing heavy operations at the end of the pipeline
- Organizing transformers for better resource utilization

### Example Integration

```javascript
// Validation happens automatically in the pipeline
const registry = await TransformerRegistry.createDefault();
const validation = registry.validatePlan(['pdf', 'markdown', 'image']);

if (!validation.valid) {
  console.log('Issues found:', validation.issues);
}

// Optimization suggestions
const optimization = registry.optimizePlan(['pdf', 'first-lines', 'markdown']);
console.log('Optimized order:', optimization.optimized);
```

For detailed information about the traits system, see the [Transformer Traits Development Guide](../development/transformer-traits.md).

## Custom Transformers

While not covered here, CopyTree's architecture supports custom transformers. See the development documentation for creating your own transformers.

## Next Steps

- [Profile Creation Guide](./profile-creation-guide.md) - Configure transformers in profiles
- [Profile Examples](./profile-examples.md) - See transformers in action
- [Advanced Features](./profile-advanced.md) - Complex transformer patterns
- [Transformer Traits System](../development/transformer-traits.md) - Advanced validation and optimization