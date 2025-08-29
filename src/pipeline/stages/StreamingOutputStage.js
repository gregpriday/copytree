import Stage from '../Stage.js';
import { Transform } from 'stream';
// const { create } = require('xmlbuilder2'); // Currently unused
import path from 'path';
import {
  detectFenceLanguage,
  chooseFence,
  formatBeginMarker,
  formatEndMarker,
  escapeYamlScalar,
} from '../../utils/markdown.js';
import { hashFile, hashContent } from '../../utils/fileHash.js';

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
      outputFormat: this.format,
    };
  }

  createTransformStream(input) {
    if (this.format === 'xml') {
      return this.createXMLStream(input);
    } else if (this.format === 'json') {
      return this.createJSONStream(input);
    } else if (this.format === 'tree') {
      return this.createTreeStream(input);
    } else if (this.format === 'markdown') {
      return this.createMarkdownStream(input);
    }
    
    throw new Error(`Unknown streaming format: ${this.format}`);
  }

  createMarkdownStream(input) {
    const stream = new Transform({
      writableObjectMode: true,
      transform: (chunk, _encoding, callback) => callback(null, chunk),
    });
    const files = input.files || [];
    const nonNullFiles = files.filter((f) => f !== null);
    const fileCount = nonNullFiles.length;
    const totalSize = this.calculateTotalSize(nonNullFiles);
    const includeGitStatus = !!(input.options?.withGitStatus);
    const includeLineNumbers = !!(this.addLineNumbers || input.options?.withLineNumbers);
    const onlyTree = !!(input.options?.onlyTree);
    const charLimitApplied = !!(input.options?.charLimit || input.stats?.truncatedFiles > 0 || nonNullFiles.some((f) => f?.truncated));

    // Header and front matter
    stream.write('---\n');
    stream.write(`format: copytree-md@1\n`);
    stream.write(`tool: copytree\n`);
    stream.write(`generated: ${escapeYamlScalar(new Date().toISOString())}\n`);
    stream.write(`base_path: ${escapeYamlScalar(input.basePath)}\n`);
    stream.write(`profile: ${escapeYamlScalar(input.profile?.name || 'default')}\n`);
    stream.write(`file_count: ${fileCount}\n`);
    stream.write(`total_size_bytes: ${totalSize}\n`);
    stream.write(`char_limit_applied: ${charLimitApplied ? 'true' : 'false'}\n`);
    stream.write(`only_tree: ${onlyTree ? 'true' : 'false'}\n`);
    stream.write(`include_git_status: ${includeGitStatus ? 'true' : 'false'}\n`);
    stream.write(`include_line_numbers: ${includeLineNumbers ? 'true' : 'false'}\n`);
    const instrIncluded = !!(input.instructions && !input.options?.noInstructions);
    const instrName = input.instructionsName || null;
    stream.write('instructions:\n');
    stream.write(`  name: ${instrName ? escapeYamlScalar(instrName) : 'null'}\n`);
    stream.write(`  included: ${instrIncluded ? 'true' : 'false'}\n`);
    stream.write('---\n\n');

    // Title
    stream.write(`# CopyTree Export — ${path.basename(input.basePath)}\n\n`);

    // Directory Tree
    stream.write('## Directory Tree\n');
    const tree = this.buildTreeStructure(nonNullFiles);
    const treeLines = [];
    this.renderTree(tree, treeLines, '', true);
    stream.write('```text\n');
    stream.write(treeLines.join('\n'));
    stream.write('\n```\n\n');

    // Instructions
    if (instrIncluded) {
      stream.write('## Instructions\n\n');
      stream.write(`<!-- copytree:instructions-begin name=${escapeYamlScalar(instrName || 'default')} -->\n`);
      const instrFence = chooseFence(input.instructions || '');
      stream.write(`${instrFence}text\n`);
      stream.write(input.instructions.toString());
      stream.write(`\n${instrFence}\n\n`);
      stream.write(`<!-- copytree:instructions-end name=${escapeYamlScalar(instrName || 'default')} -->\n\n`);
    }

    // Transform per file
    stream._transform = async (file, _encoding, callback) => {
      if (!file || onlyTree) return callback();

      const relPath = `@${file.path}`;
      const modifiedISO = file.modified ? (file.modified instanceof Date ? file.modified.toISOString() : new Date(file.modified).toISOString()) : null;
      let sha = null;
      try {
        if (file.absolutePath) sha = await hashFile(file.absolutePath, 'sha256');
        else if (typeof file.content === 'string') sha = hashContent(file.content, 'sha256');
      } catch (_e) {}
      const attrs = {
        path: relPath,
        size: file.size ?? 0,
        modified: modifiedISO || undefined,
        hash: sha ? `sha256:${sha}` : undefined,
        git: includeGitStatus && file.gitStatus ? file.gitStatus : undefined,
        binary: file.isBinary ? true : false,
        truncated: file.truncated ? true : false,
      };
      let chunk = '';
      chunk += formatBeginMarker(attrs) + '\n\n';
      chunk += `### ${relPath}\n\n`;
      const binaryAction = this.config.get('copytree.binaryFileAction', 'placeholder');
      let binaryLabel = null;
      if (file.isBinary) {
        if (binaryAction === 'base64' || file.encoding === 'base64') binaryLabel = 'base64';
        else if (binaryAction === 'placeholder') binaryLabel = 'placeholder';
        else if (binaryAction === 'skip') binaryLabel = 'skipped';
      }
      const parts = [];
      if (typeof (file.size ?? 0) === 'number') parts.push(`Size: ${(file.size ?? 0).toLocaleString()} bytes`);
      if (modifiedISO) parts.push(`Modified: ${modifiedISO}`);
      if (includeGitStatus && file.gitStatus) parts.push(`Git: ${file.gitStatus}`);
      if (binaryLabel) parts.push(`Binary: ${binaryLabel}`);
      if (file.truncated) parts.push(`Truncated at ${(file.content?.length || 0).toLocaleString()} chars`);
      chunk += `<small>${parts.join(' • ')}</small>\n\n`;

      const lang = file.isBinary
        ? (binaryAction === 'base64' || file.encoding === 'base64' ? 'text' : 'text')
        : detectFenceLanguage(file.path);
      const content = file.content || '';
      const fence = chooseFence(typeof content === 'string' ? content : '');
      chunk += `${fence}${lang ? lang : ''}`.trim() + '\n';
      if (file.isBinary) {
        if (binaryAction === 'base64' || file.encoding === 'base64') {
          chunk += 'Content-Transfer: base64\n';
          chunk += (typeof content === 'string' ? content : '') + '\n';
        } else if (binaryAction === 'placeholder') {
          chunk += (typeof content === 'string' ? content : (this.config.get('copytree.binaryPlaceholderText', '[Binary file not included]') || '')) + '\n';
        }
      } else {
        const text = this.addLineNumbers ? this.addLineNumbersToContent(content) : content;
        chunk += text + '\n';
      }
      chunk += `${fence}\n`;
      if (file.truncated) {
        const remaining = typeof file.originalLength === 'number' ? Math.max(0, file.originalLength - (file.content?.length || 0)) : undefined;
        chunk += `\n<!-- copytree:truncated reason="char-limit"${remaining !== undefined ? ` remaining="${remaining}"` : ''} -->\n`;
      }
      chunk += `\n${formatEndMarker(relPath)}\n\n`;

      callback(null, chunk);
    };

    // End handler
    stream.on('pipe', (src) => {
      src.on('end', () => {
        stream.end();
      });
    });

    return stream;
  }

  createXMLStream(input) {
    const stream = new Transform({
      writableObjectMode: true,
      transform: (chunk, encoding, callback) => {
        callback(null, chunk);
      },
    });

    // Write XML header and metadata
    const header = '<?xml version="1.0" encoding="UTF-8"?>\n';
    const rootStart = `<ct:directory xmlns:ct="urn:copytree" path="${input.basePath}">\n`;
    
    stream.write(header);
    stream.write(rootStart);
    
    // Write metadata
    stream.write('  <ct:metadata>\n');
    stream.write(`    <ct:generated>${new Date().toISOString()}</ct:generated>\n`);
    stream.write(`    <ct:fileCount>${input.files.length}</ct:fileCount>\n`);
    stream.write(`    <ct:totalSize>${this.calculateTotalSize(input.files)}</ct:totalSize>\n`);
    
    if (input.profile) {
      stream.write(`    <ct:profile>${input.profile.name || 'default'}</ct:profile>\n`);
    }
    
    if (input.gitMetadata) {
      stream.write('    <ct:git>\n');
      if (input.gitMetadata.branch) {
        stream.write(`      <ct:branch>${input.gitMetadata.branch}</ct:branch>\n`);
      }
      if (input.gitMetadata.lastCommit) {
        const msg = (input.gitMetadata.lastCommit.message || '').toString().split(']]>').join(']]]]><![CDATA[>');
        stream.write(`      <ct:lastCommit hash="${input.gitMetadata.lastCommit.hash}"><![CDATA[${msg}]]></ct:lastCommit>\n`);
      }
      stream.write('    </ct:git>\n');
    }
    
    stream.write('  </ct:metadata>\n');
    stream.write('  <ct:files>\n');
    
    // Transform for individual files
    stream._transform = (file, encoding, callback) => {
      if (!file || file === null) {
        callback();
        return;
      }
      
      let xml = `    <ct:file path="@${file.path}" size="${file.size}"`;
      
      if (file.modified) {
        const modifiedDate = file.modified instanceof Date 
          ? file.modified 
          : new Date(file.modified);
        xml += ` modified="${modifiedDate.toISOString()}"`;
      }
      
      if (file.isBinary) {
        xml += ' binary="true"';
        if (file.encoding) {
          xml += ` encoding="${file.encoding}"`;
        }
      }
      
      if (file.gitStatus) {
        xml += ` gitStatus="${file.gitStatus}"`;
      }
      
      xml += '>';
      
      // Add content directly to file element
      let content = file.content || '';
      if (this.addLineNumbers && !file.isBinary) {
        content = this.addLineNumbersToContent(content);
      }
      
      // Wrap content in CDATA to ensure well-formed XML
      const c = content.toString().split(']]>').join(']]]]><![CDATA[>');
      xml += `<![CDATA[${c}]]>`;
      xml += '</ct:file>\n';
      
      callback(null, xml);
    };
    
    // Add end handler to close XML
    stream.on('pipe', (src) => {
      src.on('end', () => {
        stream.write('  </ct:files>\n');
        stream.write('</ct:directory>\n');
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
      },
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
          : file.content,
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
      },
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
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    }
    
    // Signal end of data
    transformStream.end();
  }

  // Removed escapeXML method - content is now output raw without escaping

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
            size: file.size,
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

  renderTree(node, lines, prefix, _isLast) {
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

export default StreamingOutputStage;
