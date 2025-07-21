const Stage = require('../Stage');
const { Transform } = require('stream');
const { create } = require('xmlbuilder2');
const path = require('path');

/**
 * Streaming output stage for handling large outputs
 * Processes files one at a time and streams output
 */
class StreamingOutputStage extends Stage {
  constructor(options = {}) {
    super(options);
    this.format = options.format || 'xml';
    this.outputStream = options.outputStream || process.stdout;
    this.addLineNumbers = this.config.get('copytree.addLineNumbers', false);
    this.lineNumberFormat = this.config.get('copytree.lineNumberFormat', '%4d: ');
    this.prettyPrint = options.prettyPrint ?? true;
  }

  async process(input) {
    this.log(`Streaming output as ${this.format}`, 'debug');
    const startTime = Date.now();

    // Create transform stream
    const transformStream = this.createTransformStream(input);
    
    // Connect to output stream
    transformStream.pipe(this.outputStream);

    // Process files through stream
    await this.streamFiles(input, transformStream);

    // Wait for stream to finish
    await new Promise((resolve, reject) => {
      transformStream.on('finish', resolve);
      transformStream.on('error', reject);
    });

    this.log(`Streamed output in ${this.getElapsedTime(startTime)}`, 'info');

    // Return input unchanged (streaming doesn't modify the data)
    return {
      ...input,
      streamed: true,
      outputFormat: this.format
    };
  }

  createTransformStream(input) {
    if (this.format === 'xml') {
      return this.createXMLStream(input);
    } else if (this.format === 'json') {
      return this.createJSONStream(input);
    } else if (this.format === 'tree') {
      return this.createTreeStream(input);
    }
    
    throw new Error(`Unknown streaming format: ${this.format}`);
  }

  createXMLStream(input) {
    const stream = new Transform({
      writableObjectMode: true,
      transform: (chunk, encoding, callback) => {
        callback(null, chunk);
      }
    });

    // Write XML header and metadata
    const header = '<?xml version="1.0" encoding="UTF-8"?>\n';
    const rootStart = `<directory path="${this.escapeXML(input.basePath)}">\n`;
    
    stream.write(header);
    stream.write(rootStart);
    
    // Write metadata
    stream.write('  <metadata>\n');
    stream.write(`    <generated>${new Date().toISOString()}</generated>\n`);
    stream.write(`    <fileCount>${input.files.length}</fileCount>\n`);
    stream.write(`    <totalSize>${this.calculateTotalSize(input.files)}</totalSize>\n`);
    
    if (input.profile) {
      stream.write(`    <profile>${this.escapeXML(input.profile.name || 'default')}</profile>\n`);
    }
    
    if (input.gitMetadata) {
      stream.write('    <git>\n');
      if (input.gitMetadata.branch) {
        stream.write(`      <branch>${this.escapeXML(input.gitMetadata.branch)}</branch>\n`);
      }
      if (input.gitMetadata.lastCommit) {
        stream.write(`      <lastCommit hash="${this.escapeXML(input.gitMetadata.lastCommit.hash)}">${
          this.escapeXML(input.gitMetadata.lastCommit.message)
        }</lastCommit>\n`);
      }
      stream.write('    </git>\n');
    }
    
    stream.write('  </metadata>\n');
    stream.write('  <files>\n');
    
    // Transform for individual files
    stream._transform = (file, encoding, callback) => {
      if (!file || file === null) {
        callback();
        return;
      }
      
      let xml = `    <file path="${this.escapeXML(file.path)}" size="${file.size}"`;
      
      if (file.modified) {
        xml += ` modified="${file.modified.toISOString()}"`;
      }
      
      if (file.isBinary) {
        xml += ` binary="true"`;
        if (file.encoding) {
          xml += ` encoding="${file.encoding}"`;
        }
      }
      
      if (file.gitStatus) {
        xml += ` gitStatus="${file.gitStatus}"`;
      }
      
      xml += '>\n';
      
      // Add content
      let content = file.content || '';
      if (this.addLineNumbers && !file.isBinary) {
        content = this.addLineNumbersToContent(content);
      }
      
      xml += `      <content>${this.escapeXML(content)}</content>\n`;
      xml += '    </file>\n';
      
      callback(null, xml);
    };
    
    // Add end handler to close XML
    stream.on('pipe', (src) => {
      src.on('end', () => {
        stream.write('  </files>\n');
        stream.write('</directory>\n');
        stream.end();
      });
    });
    
    return stream;
  }

  createJSONStream(input) {
    const stream = new Transform({
      writableObjectMode: true,
      transform: (chunk, encoding, callback) => {
        callback(null, chunk);
      }
    });

    let isFirst = true;
    
    // Write JSON header
    stream.write('{\n');
    stream.write(`  "directory": "${input.basePath}",\n`);
    stream.write('  "metadata": {\n');
    stream.write(`    "generated": "${new Date().toISOString()}",\n`);
    stream.write(`    "fileCount": ${input.files.length},\n`);
    stream.write(`    "totalSize": ${this.calculateTotalSize(input.files)}`);
    
    if (input.profile) {
      stream.write(',\n');
      stream.write(`    "profile": "${input.profile.name || 'default'}"`);
    }
    
    stream.write('\n  },\n');
    stream.write('  "files": [\n');
    
    // Transform for individual files
    stream._transform = (file, encoding, callback) => {
      if (!file || file === null) {
        callback();
        return;
      }
      
      let json = '';
      if (!isFirst) {
        json += ',\n';
      }
      isFirst = false;
      
      const fileObj = {
        path: file.path,
        size: file.size,
        modified: file.modified,
        isBinary: file.isBinary,
        encoding: file.encoding,
        content: this.addLineNumbers && !file.isBinary 
          ? this.addLineNumbersToContent(file.content)
          : file.content
      };
      
      json += '    ' + JSON.stringify(fileObj, null, this.prettyPrint ? 2 : 0)
        .split('\n')
        .map((line, i) => i === 0 ? line : '    ' + line)
        .join('\n');
      
      callback(null, json);
    };
    
    // Add end handler to close JSON
    stream.on('pipe', (src) => {
      src.on('end', () => {
        stream.write('\n  ]\n');
        stream.write('}\n');
        stream.end();
      });
    });
    
    return stream;
  }

  createTreeStream(input) {
    const stream = new Transform({
      writableObjectMode: true,
      transform: (chunk, encoding, callback) => {
        callback(null, chunk);
      }
    });

    // For tree format, we need to collect all files first
    // So we'll buffer them and output at the end
    const files = [];
    
    stream._transform = (file, encoding, callback) => {
      if (file && file !== null) {
        files.push(file);
      }
      callback();
    };
    
    stream.on('pipe', (src) => {
      src.on('end', () => {
        // Build and render tree
        const lines = [];
        lines.push(input.basePath);
        lines.push('');
        
        const tree = this.buildTreeStructure(files);
        this.renderTree(tree, lines, '', true);
        
        lines.push('');
        lines.push(`${files.length} files, ${this.formatBytes(this.calculateTotalSize(files))}`);
        
        stream.write(lines.join('\n') + '\n');
        stream.end();
      });
    });
    
    return stream;
  }

  async streamFiles(input, transformStream) {
    // Process files one at a time to manage memory
    for (const file of input.files) {
      if (file !== null) {
        transformStream.write(file);
        
        // Small delay to prevent overwhelming the stream
        if (input.files.indexOf(file) % 100 === 0) {
          await new Promise(resolve => setImmediate(resolve));
        }
      }
    }
    
    // Signal end of data
    transformStream.end();
  }

  escapeXML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  addLineNumbersToContent(content) {
    if (!content) return content;
    
    const lines = content.split('\n');
    return lines.map((line, index) => {
      const lineNumber = (index + 1).toString();
      const formatted = this.lineNumberFormat
        .replace('%d', lineNumber)
        .replace('%4d', lineNumber.padStart(4));
      return formatted + line;
    }).join('\n');
  }

  calculateTotalSize(files) {
    return files.reduce((total, file) => {
      return total + (file ? file.size : 0);
    }, 0);
  }

  buildTreeStructure(files) {
    const tree = {};
    
    for (const file of files) {
      if (file === null) continue;
      
      const parts = file.path.split(path.sep);
      let current = tree;
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        
        if (i === parts.length - 1) {
          current[part] = {
            isFile: true,
            size: file.size
          };
        } else {
          if (!current[part]) {
            current[part] = {};
          }
          current = current[part];
        }
      }
    }
    
    return tree;
  }

  renderTree(node, lines, prefix, isLast) {
    const entries = Object.entries(node).sort(([a], [b]) => {
      const aIsFile = node[a].isFile;
      const bIsFile = node[b].isFile;
      
      if (aIsFile && !bIsFile) return 1;
      if (!aIsFile && bIsFile) return -1;
      
      return a.localeCompare(b);
    });
    
    entries.forEach(([name, value], index) => {
      const isLastEntry = index === entries.length - 1;
      const connector = isLastEntry ? '└── ' : '├── ';
      
      if (value.isFile) {
        lines.push(`${prefix}${connector}${name} (${this.formatBytes(value.size)})`);
      } else {
        lines.push(`${prefix}${connector}${name}/`);
        
        const extension = isLastEntry ? '    ' : '│   ';
        this.renderTree(value, lines, prefix + extension, false);
      }
    });
  }
}

module.exports = StreamingOutputStage;