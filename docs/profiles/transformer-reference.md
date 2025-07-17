# Transformer Reference

This document provides a comprehensive list of all available transformers in Copytree. Transformers modify file contents during processing and are applied using the `transforms` section in profile YAML files.

## How to Use Transformers

Transformers are specified in your profile YAML using dot notation:

```yaml
transforms:
  - files: "**/*.pdf"
    type: Converters.PDFToText
  - files: "**/*.jpg"
    type: Images.ImageDescription
```

## Available Transformers

### Converters

#### `Converters.PDFToText`
Converts PDF files to plain text using either `pdftotext` or Pandoc.
- **Use for:** PDF files that need to be included as text
- **Example:** Research papers, documentation PDFs

#### `Converters.DocumentToText`
Converts various document formats (DOCX, ODT, RTF, etc.) to plain text using Pandoc.
- **Use for:** Office documents, rich text files
- **Requires:** Pandoc to be installed

### CSV

#### `CSV.CSVFirstLinesTransformer`
Shows a preview of CSV files by returning the first 20 lines.
- **Use for:** Large CSV files where you only need a sample
- **Example:** Data files, export files

### Generic

#### `Generic.FirstLinesTransformer`
Returns the first 20 lines of any text file.
- **Use for:** Large text files, logs, or any file where a preview is sufficient
- **Example:** Log files, large data files

### HTML

#### `HTML.HTMLStripper`
Removes HTML tags and returns plain text content.
- **Use for:** HTML files where you need the text content without markup
- **Example:** Web pages, HTML documentation

### Images

#### `Images.ImageDescription`
Generates text descriptions of images using AI (requires AI provider configuration).
- **Use for:** Including visual content as text descriptions
- **Supports:** JPG, PNG, GIF, BMP, WebP formats

#### `Images.SvgDescription`
Generates descriptions of SVG files.
- **Use for:** Vector graphics, diagrams, icons
- **Example:** Architecture diagrams, flowcharts

### Loaders

#### `Loaders.FileLoader`
Default file loader that returns raw file content.
- **Use for:** Files that should be included as-is
- **Note:** This is the default behavior if no transformer is specified

### Markdown

#### `Markdown.MarkdownStripper`
Converts Markdown to plain text by removing all formatting.
- **Use for:** Markdown files where you need plain text only
- **Example:** README files, documentation

#### `Markdown.MarkdownLinkStripper`
Removes all links from Markdown files while preserving other formatting.
- **Use for:** Markdown files where links should be removed
- **Example:** Documentation for offline use

### Summarizers

#### `Summarizers.FileSummary`
Creates AI-powered summaries of file contents (requires AI provider configuration).
- **Use for:** Large files that need to be condensed
- **Example:** Long documentation, research papers

#### `Summarizers.CodeSummary`
Creates specialized summaries for code files, focusing on functionality and structure.
- **Use for:** Source code files
- **Example:** Complex classes, modules

#### `Summarizers.UnitTestSummary`
Creates summaries specifically tailored for unit test files.
- **Use for:** Test files
- **Example:** Test suites, spec files

## Example Profile with Transformers

```yaml
# Example profile showing various transformer usage
include:
  - "**/*.md"
  - "**/*.pdf"
  - "**/*.jpg"
  - "**/*.png"
  - "**/*.csv"
  - "src/**/*.php"
  - "tests/**/*.php"

transforms:
  # Convert PDFs to text
  - files: "**/*.pdf"
    type: Converters.PDFToText
  
  # Generate descriptions for images
  - files: "**/*.{jpg,png}"
    type: Images.ImageDescription
  
  # Show preview of CSV files
  - files: "**/*.csv"
    type: CSV.CSVFirstLinesTransformer
  
  # Summarize long markdown files
  - files: "README.md"
    type: Summarizers.FileSummary
  
  # Summarize source code
  - files: "src/**/*.php"
    type: Summarizers.CodeSummary
  
  # Summarize test files
  - files: "tests/**/*.php"
    type: Summarizers.UnitTestSummary
```

## Notes

1. **AI-Powered Transformers**: Some transformers (like `Images.ImageDescription` and `Summarizers.*`) require AI provider configuration in your environment.

2. **External Dependencies**: Some transformers require external tools:
   - `Converters.PDFToText`: Requires `pdftotext` (from Poppler) or Pandoc
   - `Converters.DocumentToText`: Requires Pandoc

3. **Performance**: Transformers that use AI or external tools may slow down processing, especially for large numbers of files.

4. **Fallback Behavior**: If a transformer fails, the original file content is typically used instead.