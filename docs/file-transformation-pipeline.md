# File Transformation Pipeline Architecture

## Overview

The file transformation pipeline is a core component of CopyTree that processes various file types into text representations. This document details the pipeline architecture, transformer implementations, and migration strategies from PHP to Node.js.

## Pipeline Architecture

### PHP Implementation

```php
// Pipeline with transform stage
$pipeline = app(Pipeline::class)
    ->send($files)
    ->through([
        FileLoader::class,
        TransformStage::class, // Applies transformers
        // other stages...
    ])
    ->thenReturn();
```

### Node.js Architecture

```javascript
// src/pipeline/Pipeline.js
class Pipeline {
    constructor() {
        this.stages = [];
    }
    
    through(stages) {
        this.stages = stages;
        return this;
    }
    
    async process(input) {
        let result = input;
        
        for (const Stage of this.stages) {
            const stage = new Stage();
            result = await stage.process(result);
            
            // Emit progress events
            this.emit('stage:complete', { stage: Stage.name, result });
        }
        
        return result;
    }
}
```

## Transform Stage Implementation

### Core Transform Stage

```javascript
// src/pipeline/stages/TransformStage.js
const { TransformerRegistry } = require('../../transforms/TransformerRegistry');
const { EventEmitter } = require('events');

class TransformStage extends EventEmitter {
    async process(files) {
        const transformedFiles = [];
        const registry = TransformerRegistry.getInstance();
        
        // Track heavy transforms for progress
        const heavyTransforms = files.filter(file => 
            registry.getTransformer(file).isHeavy()
        );
        
        if (heavyTransforms.length > 0) {
            this.emit('transform:start', { 
                total: heavyTransforms.length 
            });
        }
        
        // Process files (potentially in parallel)
        const promises = files.map(async (file) => {
            const transformer = registry.getTransformer(file);
            
            try {
                const transformed = await transformer.transform(file);
                
                if (transformer.isHeavy()) {
                    this.emit('transform:progress', { file });
                }
                
                return {
                    ...file,
                    content: transformed.content,
                    metadata: {
                        ...file.metadata,
                        transformed: true,
                        transformer: transformer.name
                    }
                };
            } catch (error) {
                console.warn(`Transform failed for ${file.path}:`, error);
                return file; // Return original on failure
            }
        });
        
        const results = await Promise.all(promises);
        
        this.emit('transform:complete');
        return results;
    }
}
```

## Transformer Registry

```javascript
// src/transforms/TransformerRegistry.js
class TransformerRegistry {
    constructor() {
        this.transformers = new Map();
        this.matchers = [];
        this.registerDefaults();
    }
    
    registerDefaults() {
        // File extension based transformers
        this.register('.pdf', require('./transformers/PDFTransformer'));
        this.register(['.jpg', '.jpeg', '.png'], require('./transformers/ImageTransformer'));
        this.register('.md', require('./transformers/MarkdownTransformer'));
        this.register('.csv', require('./transformers/CSVTransformer'));
        this.register(['.doc', '.docx'], require('./transformers/DocumentTransformer'));
        
        // Pattern based transformers
        this.registerPattern(/test\.(js|ts)$/, require('./transformers/TestSummaryTransformer'));
        this.registerPattern(/\.(js|ts|py|java)$/, require('./transformers/CodeSummaryTransformer'));
        
        // Default transformer
        this.setDefault(require('./transformers/FileLoader'));
    }
    
    register(extensions, Transformer) {
        const exts = Array.isArray(extensions) ? extensions : [extensions];
        exts.forEach(ext => this.transformers.set(ext, Transformer));
    }
    
    registerPattern(pattern, Transformer) {
        this.matchers.push({ pattern, Transformer });
    }
    
    getTransformer(file) {
        // Check extension first
        const ext = path.extname(file.path).toLowerCase();
        if (this.transformers.has(ext)) {
            return new (this.transformers.get(ext))();
        }
        
        // Check patterns
        for (const { pattern, Transformer } of this.matchers) {
            if (pattern.test(file.path)) {
                return new Transformer();
            }
        }
        
        // Return default
        return new this.defaultTransformer();
    }
}
```

## Base Transformer Class

```javascript
// src/transforms/BaseTransformer.js
class BaseTransformer {
    constructor() {
        this.name = this.constructor.name;
    }
    
    // Must be implemented by subclasses
    async transform(file) {
        throw new Error('transform() must be implemented');
    }
    
    // Override for heavy transformers (shows progress)
    isHeavy() {
        return false;
    }
    
    // Helper to read file content
    async readFile(filePath) {
        return fs.readFile(filePath, 'utf8');
    }
    
    // Helper to check file size
    async getFileSize(filePath) {
        const stats = await fs.stat(filePath);
        return stats.size;
    }
}
```

## Transformer Implementations

### 1. PDF Transformer

```javascript
// src/transforms/transformers/PDFTransformer.js
const pdfParse = require('pdf-parse');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class PDFTransformer extends BaseTransformer {
    isHeavy() {
        return true;
    }
    
    async transform(file) {
        // Try pdftotext first (better quality)
        try {
            const { stdout } = await execAsync(`pdftotext "${file.path}" -`);
            return {
                content: stdout,
                metadata: { method: 'pdftotext' }
            };
        } catch (error) {
            // Fallback to pdf-parse
            const dataBuffer = await fs.readFile(file.path);
            const data = await pdfParse(dataBuffer);
            
            return {
                content: data.text,
                metadata: { 
                    method: 'pdf-parse',
                    pages: data.numpages
                }
            };
        }
    }
}
```

### 2. Image Transformer (with OCR)

```javascript
// src/transforms/transformers/ImageTransformer.js
const Tesseract = require('tesseract.js');
const sharp = require('sharp');

class ImageTransformer extends BaseTransformer {
    isHeavy() {
        return true;
    }
    
    async transform(file) {
        // Get image metadata
        const metadata = await sharp(file.path).metadata();
        
        // Skip very large images
        if (metadata.width > 4000 || metadata.height > 4000) {
            return {
                content: `[Image: ${metadata.width}x${metadata.height} ${metadata.format}]`,
                metadata: { skipped: true, reason: 'too_large' }
            };
        }
        
        // Perform OCR
        try {
            const { data: { text } } = await Tesseract.recognize(
                file.path,
                'eng',
                {
                    logger: m => {} // Suppress logs
                }
            );
            
            return {
                content: text || '[No text detected in image]',
                metadata: {
                    dimensions: `${metadata.width}x${metadata.height}`,
                    format: metadata.format
                }
            };
        } catch (error) {
            return {
                content: `[Image: ${path.basename(file.path)}]`,
                metadata: { error: error.message }
            };
        }
    }
}
```

### 3. Markdown Transformer

```javascript
// src/transforms/transformers/MarkdownTransformer.js
const marked = require('marked');
const TurndownService = require('turndown');

class MarkdownTransformer extends BaseTransformer {
    constructor() {
        super();
        this.turndown = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced'
        });
    }
    
    async transform(file) {
        const content = await this.readFile(file.path);
        
        // Option 1: Strip to plain text
        const html = marked.parse(content);
        const text = this.stripHtml(html);
        
        // Option 2: Simplify markdown (remove links, images)
        // const simplified = this.simplifyMarkdown(content);
        
        return {
            content: text,
            metadata: {
                originalLength: content.length,
                transformedLength: text.length
            }
        };
    }
    
    stripHtml(html) {
        return html
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\n\s*\n/g, '\n\n')
            .trim();
    }
    
    simplifyMarkdown(content) {
        // Remove images
        content = content.replace(/!\[.*?\]\(.*?\)/g, '');
        // Remove links but keep text
        content = content.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
        return content;
    }
}
```

### 4. Code Summary Transformer (AI-powered)

```javascript
// src/transforms/transformers/CodeSummaryTransformer.js
const { AIProviderFactory } = require('../../ai/AIProviderFactory');

class CodeSummaryTransformer extends BaseTransformer {
    constructor() {
        super();
        this.aiProvider = AIProviderFactory.create();
    }
    
    isHeavy() {
        return true;
    }
    
    async transform(file) {
        const content = await this.readFile(file.path);
        
        // Skip small files
        if (content.length < 1000) {
            return { content, metadata: { skipped: true } };
        }
        
        // Generate summary
        const prompt = `Summarize this code file in 3-5 sentences. Focus on its purpose and main functionality:\n\n${content.substring(0, 3000)}`;
        
        try {
            const response = await this.aiProvider.generateCompletion(prompt, {
                maxTokens: 150,
                temperature: 0.3
            });
            
            return {
                content: `[Summary: ${response.text}]\n\n${content}`,
                metadata: {
                    summarized: true,
                    originalLength: content.length
                }
            };
        } catch (error) {
            // Return original on AI failure
            return { content, metadata: { error: error.message } };
        }
    }
}
```

### 5. CSV Transformer

```javascript
// src/transforms/transformers/CSVTransformer.js
const csv = require('csv-parse');
const { Readable } = require('stream');

class CSVTransformer extends BaseTransformer {
    async transform(file) {
        const content = await this.readFile(file.path);
        const lines = content.split('\n');
        
        // For large CSVs, just show preview
        if (lines.length > 100) {
            const preview = lines.slice(0, 10).join('\n');
            return {
                content: `${preview}\n\n[... ${lines.length - 10} more rows ...]`,
                metadata: {
                    rows: lines.length,
                    truncated: true
                }
            };
        }
        
        return { content, metadata: { rows: lines.length } };
    }
}
```

### 6. Binary File Handler

```javascript
// src/transforms/transformers/BinaryTransformer.js
class BinaryTransformer extends BaseTransformer {
    async transform(file) {
        const stats = await fs.stat(file.path);
        const fileType = await this.detectFileType(file.path);
        
        return {
            content: `[Binary file: ${path.basename(file.path)} (${this.formatSize(stats.size)})]`,
            metadata: {
                binary: true,
                size: stats.size,
                type: fileType
            }
        };
    }
    
    formatSize(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }
    
    async detectFileType(filePath) {
        // Use file-type package or magic numbers
        const fileType = await import('file-type');
        const type = await fileType.fromFile(filePath);
        return type?.mime || 'unknown';
    }
}
```

## Configuration and Customization

### Profile-based Transformer Configuration

```yaml
# profiles/web-project.yaml
name: web-project
description: Web development project

transforms:
  # Disable heavy transforms
  disable:
    - ImageTransformer
    - CodeSummaryTransformer
  
  # Custom transform rules
  rules:
    - pattern: "*.min.js"
      transformer: skip
    - pattern: "*.map"
      transformer: skip
    - pattern: "package-lock.json"
      transformer: FirstLinesTransformer
      options:
        lines: 20
```

### User-defined Transformers

```javascript
// ~/.copytree/transformers/CustomTransformer.js
module.exports = class CustomTransformer extends BaseTransformer {
    async transform(file) {
        // Custom transformation logic
    }
};

// Register in config
{
    "transformers": {
        "custom": {
            "pattern": "*.custom",
            "transformer": "~/.copytree/transformers/CustomTransformer.js"
        }
    }
}
```

## Performance Optimization

### 1. Parallel Processing

```javascript
// Process files in batches
const pLimit = require('p-limit');
const limit = pLimit(5); // Max 5 concurrent transforms

const transformed = await Promise.all(
    files.map(file => limit(() => transformer.transform(file)))
);
```

### 2. Caching

```javascript
// src/transforms/TransformCache.js
class TransformCache {
    constructor() {
        this.cache = new Map();
    }
    
    getCacheKey(file) {
        return `${file.path}:${file.mtime}:${file.size}`;
    }
    
    async getOrTransform(file, transformer) {
        const key = this.getCacheKey(file);
        
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }
        
        const result = await transformer.transform(file);
        this.cache.set(key, result);
        
        // LRU eviction if cache too large
        if (this.cache.size > 1000) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        
        return result;
    }
}
```

### 3. Stream Processing

```javascript
// For very large files
class StreamingTransformer extends BaseTransformer {
    async transform(file) {
        const stream = fs.createReadStream(file.path);
        const chunks = [];
        
        for await (const chunk of stream) {
            chunks.push(chunk);
            
            // Process incrementally if needed
            if (chunks.length > 100) {
                break; // Limit for preview
            }
        }
        
        return {
            content: Buffer.concat(chunks).toString(),
            metadata: { streamed: true }
        };
    }
}
```

## Error Handling

1. **Graceful Degradation**: Return original content on transform failure
2. **Timeout Protection**: Set max execution time for transformers
3. **Memory Limits**: Monitor memory usage for large files
4. **User Feedback**: Clear error messages in verbose mode

## Testing Strategy

```javascript
// tests/transforms/PDFTransformer.test.js
describe('PDFTransformer', () => {
    it('should extract text from PDF', async () => {
        const transformer = new PDFTransformer();
        const file = {
            path: '__fixtures__/sample.pdf',
            name: 'sample.pdf'
        };
        
        const result = await transformer.transform(file);
        
        expect(result.content).toContain('Expected text');
        expect(result.metadata.method).toBeDefined();
    });
    
    it('should handle corrupted PDFs', async () => {
        // Test error handling
    });
});
```

## Migration Checklist

- [ ] Implement base transformer architecture
- [ ] Create transformer registry
- [ ] Port all 13 PHP transformers
- [ ] Add progress reporting for heavy transforms
- [ ] Implement caching layer
- [ ] Add custom transformer support
- [ ] Create comprehensive test suite
- [ ] Document transformer API
- [ ] Optimize for performance
- [ ] Add memory usage monitoring