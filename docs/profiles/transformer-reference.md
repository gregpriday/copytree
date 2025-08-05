# Transformer Reference

Transformers process files to extract, convert, or enhance their content. This reference covers all available transformers and their configuration options.

## Overview

Transformers are applied to files during the copy process to:
- Extract text from binary formats (PDFs, images)
- Convert between formats (Markdown to HTML)
- Summarize large files with AI
- Extract metadata and structure
- Optimize content for AI consumption

## Enabling Transformers

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

### Command Line

```bash
# Enable all transformers
copytree --transform

# Disable transformers
copytree --no-transform
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

### 2. AI Summary

Generates intelligent summaries of code files using AI.

**Name**: `ai-summary`

**Options**:
```yaml
transformers:
  ai-summary:
    enabled: true
    options:
      extensions:      # File extensions to process
        - .js
        - .py
        - .java
      maxFileSize: 102400  # Max size in bytes (default: 100KB)
      includeOriginal: false  # Include original with summary
```

**Supported Languages**:
- JavaScript (.js, .jsx, .ts, .tsx)
- Python (.py)
- Java (.java)
- Go (.go)
- Rust (.rs)
- C/C++ (.c, .cpp, .h)
- PHP (.php)
- Ruby (.rb)
- Swift (.swift)
- Kotlin (.kt)
- And more...

**Example Output**:
```
AI Summary:
This file implements a REST API controller for user management. It includes endpoints for:
- GET /users - List all users with pagination
- POST /users - Create new user with validation
- PUT /users/:id - Update existing user
- DELETE /users/:id - Soft delete user
The controller uses JWT authentication and includes error handling.
```

### 3. PDF to Text

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

### 4. Image Description

Generates AI descriptions of images using vision models.

**Name**: `image-description`

**Options**:
```yaml
transformers:
  image-description:
    enabled: true
    options:
      maxImageSize: 10485760  # Max size in bytes (10MB)
      apiKey: ${GEMINI_API_KEY}  # Or specify directly
      model: gemini-1.5-flash    # Vision model to use
      prompt: "Describe this image in detail"  # Custom prompt
```

**Supported Formats**:
- JPEG (.jpg, .jpeg)
- PNG (.png)
- GIF (.gif)
- WebP (.webp)
- BMP (.bmp)

**Example Output**:
```
[Image Description: screenshot.png]
This appears to be a screenshot of a web application dashboard. The interface shows:
- A navigation bar with logo and menu items
- A data visualization chart showing monthly revenue
- A table with user statistics
- Dark theme with blue accent colors
```

### 5. Image OCR

Extracts text from images using optical character recognition.

**Name**: `image`

**Options**:
```yaml
transformers:
  image:
    enabled: true
    options:
      extractText: true  # Enable OCR
      language: eng     # OCR language
```

**Use Cases**:
- Screenshots with text
- Scanned documents
- Diagrams with labels
- Error message screenshots

### 6. CSV Formatter

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

### 7. Markdown Processor

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

### 8. First Lines

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

### 9. Document to Text

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

### 10. HTML Stripper

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

### 11. Markdown Link Stripper

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

### 12. File Summary

Creates basic summaries of files without AI.

**Name**: `file-summary`

**Options**:
```yaml
transformers:
  file-summary:
    enabled: true
    options:
      includeStats: true  # File statistics
```

### 13. SVG Description

Generates descriptions of SVG graphics.

**Name**: `svg-description`

**Options**:
```yaml
transformers:
  svg-description:
    enabled: true
    options:
      extractText: true  # Extract text elements
```

### 14. Unit Test Summary

Analyzes and summarizes unit test files.

**Name**: `unit-test-summary`

**Options**:
```yaml
transformers:
  unit-test-summary:
    enabled: true
    options:
      extractTestNames: true
      countAssertions: true
```

**Features**:
- Extracts test names
- Counts test cases
- Identifies test frameworks
- Summarizes coverage

### 15. Binary Handler

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
      
  # Describe images
  image-description:
    enabled: true
    options:
      model: gemini-1.5-pro
      
  # Summarize large code files
  ai-summary:
    enabled: true
    options:
      maxFileSize: 204800  # 200KB
```

### Selective Transformation

Apply transformers to specific patterns:

```yaml
rules:
  - include: "docs/**/*.pdf"
    transform: pdf
    
  - include: "screenshots/**/*.png"
    transform: image-description
    
  - include: "src/**/*.js"
    transform: ai-summary
    transform_options:
      includeOriginal: true
```

### Performance Optimization

```yaml
transformers:
  # Limit expensive operations
  ai-summary:
    enabled: true
    options:
      maxFileSize: 51200  # 50KB limit
      
  pdf:
    enabled: true
    options:
      maxPages: 10  # First 10 pages only
      
  image-description:
    enabled: false  # Disable for speed
```

## Best Practices

### 1. Choose Appropriate Transformers

```yaml
# For code analysis
transformers:
  ai-summary:
    enabled: true
    
# For documentation
transformers:
  pdf:
    enabled: true
  markdown:
    enabled: true
    
# For visual assets
transformers:
  image-description:
    enabled: true
```

### 2. Set Reasonable Limits

```yaml
transformers:
  ai-summary:
    options:
      maxFileSize: 102400  # 100KB
      
  pdf:
    options:
      maxPages: 50  # Avoid huge documents
```

### 3. Consider API Costs

AI-powered transformers use API calls:

```yaml
# Development - more liberal
transformers:
  ai-summary:
    enabled: true
    options:
      includeOriginal: true
      
# Production - conservative
transformers:
  ai-summary:
    enabled: true
    options:
      maxFileSize: 51200  # Smaller limit
      includeOriginal: false
```

### 4. Test Transformer Output

```bash
# Test specific transformer
copytree --transform --dry-run --verbose

# Check transformation results
copytree --transform --display | less
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
- Images: Requires `tesseract.js` or Gemini API
- Documents: Requires Pandoc installed

### API Errors

**For AI transformers**:
```bash
# Check API key
echo $GEMINI_API_KEY

# Test with simple file
copytree single-file.js --transform
```

### Performance Issues

**Limit transformer scope**:
```yaml
# Only transform specific files
rules:
  - include: "important/**/*.js"
    transform: ai-summary
    
  - include: "**/*.js"
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
const validation = registry.validatePlan(['ai-summary', 'pdf', 'image']);

if (!validation.valid) {
  console.log('Issues found:', validation.issues);
}

// Optimization suggestions
const optimization = registry.optimizePlan(['heavy-ai', 'light-text', 'order-sensitive']);
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