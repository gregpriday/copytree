const Stage = require('../Stage');
const { create } = require('xmlbuilder2');
const path = require('path');
const fs = require('fs-extra');

class OutputFormattingStage extends Stage {
  constructor(options = {}) {
    super(options);
    this.format = options.format || 'xml';
    this.addLineNumbers = this.config.get('copytree.addLineNumbers', false);
    this.lineNumberFormat = this.config.get('copytree.lineNumberFormat', '%4d: ');
    this.onlyTree = options.onlyTree || false;
  }

  async process(input) {
    this.log(`Formatting output as ${this.format}`, 'debug');
    const startTime = Date.now();

    let output;
    
    switch (this.format) {
      case 'xml':
        output = await this.formatAsXML(input);
        break;
      case 'json':
        output = this.formatAsJSON(input);
        break;
      case 'tree':
        output = this.formatAsTree(input);
        break;
      default:
        throw new Error(`Unknown output format: ${this.format}`);
    }

    this.log(`Formatted output in ${this.getElapsedTime(startTime)}`, 'info');

    return {
      ...input,
      output,
      outputFormat: this.format,
      outputSize: Buffer.byteLength(output, 'utf8')
    };
  }

  async formatAsXML(input) {
    // Manual XML construction to avoid any escaping
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += `<ct:directory path="${input.basePath}">\n`;
    
    // Add metadata
    xml += '  <ct:metadata>\n';
    xml += `    <ct:generated>${new Date().toISOString()}</ct:generated>\n`;
    xml += `    <ct:fileCount>${input.files.length}</ct:fileCount>\n`;
    xml += `    <ct:totalSize>${this.calculateTotalSize(input.files)}</ct:totalSize>\n`;
    
    if (input.profile) {
      xml += `    <ct:profile>${input.profile.name || 'default'}</ct:profile>\n`;
    }
    
    // Add git metadata if present
    if (input.gitMetadata) {
      xml += '    <ct:git>\n';
      if (input.gitMetadata.branch) {
        xml += `      <ct:branch>${input.gitMetadata.branch}</ct:branch>\n`;
      }
      if (input.gitMetadata.lastCommit) {
        xml += `      <ct:lastCommit hash="${input.gitMetadata.lastCommit.hash}">${input.gitMetadata.lastCommit.message}</ct:lastCommit>\n`;
      }
      if (input.gitMetadata.filterType) {
        xml += `      <ct:filterType>${input.gitMetadata.filterType}</ct:filterType>\n`;
      }
      xml += `      <ct:hasUncommittedChanges>${input.gitMetadata.hasUncommittedChanges ? 'true' : 'false'}</ct:hasUncommittedChanges>\n`;
      xml += '    </ct:git>\n';
    }
    
    // Add directory structure to metadata
    const directoryStructure = this.generateDirectoryStructure(input.files);
    if (directoryStructure) {
      xml += `    <ct:directoryStructure>${directoryStructure}</ct:directoryStructure>\n`;
    }
    
    // Load instructions.md from project root
    const instructionsPath = path.join(__dirname, '..', '..', 'templates', 'instructions.md');
    let instructionsContent = '';
    try {
      instructionsContent = await fs.readFile(instructionsPath, 'utf8');
    } catch (error) {
      // Handle file not found or read error gracefully
      console.warn('Warning: instructions.md not found or could not be read. Skipping <ct:instructions>.');
    }
    if (instructionsContent) {
      xml += `    <ct:instructions>${instructionsContent}</ct:instructions>\n`;
    }
    
    xml += '  </ct:metadata>\n';
    xml += '  <ct:files>\n';
    
    // Add files
    for (const file of input.files) {
      if (file === null) continue; // Skip files that were filtered out
      
      xml += `    <ct:file path="@${file.path}" size="${file.size}"`;
      
      if (file.modified) {
        const modifiedDate = file.modified instanceof Date 
          ? file.modified 
          : new Date(file.modified);
        xml += ` modified="${modifiedDate.toISOString()}"`;
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
      
      xml += '>';
      
      // Add content directly to file element (unless --only-tree is set)
      if (!this.onlyTree) {
        let content = file.content || '';
        
        if (this.addLineNumbers && !file.isBinary) {
          content = this.addLineNumbersToContent(content);
        }
        
        // Output raw content without any escaping
        xml += content;
      }
      
      xml += '</ct:file>\n';
    }
    
    xml += '  </ct:files>\n';
    xml += '</ct:directory>\n';
    
    return xml;
  }

  formatAsJSON(input) {
    const output = {
      directory: input.basePath,
      metadata: {
        generated: new Date().toISOString(),
        fileCount: input.files.length,
        totalSize: this.calculateTotalSize(input.files),
        profile: input.profile?.name || 'default',
        directoryStructure: this.generateDirectoryStructure(input.files)
      },
      files: input.files.filter(f => f !== null).map(file => {
        const fileObj = {
          path: file.path,
          size: file.size,
          modified: file.modified,
          isBinary: file.isBinary,
          encoding: file.encoding
        };
        
        // Add content unless --only-tree is set
        if (!this.onlyTree) {
          fileObj.content = this.addLineNumbers && !file.isBinary 
            ? this.addLineNumbersToContent(file.content)
            : file.content;
        }
        
        return fileObj;
      })
    };

    const prettyPrint = this.config.get('app.prettyPrint', true);
    return JSON.stringify(output, null, prettyPrint ? 2 : 0);
  }

  formatAsTree(input) {
    const lines = [];
    const indent = this.config.get('copytree.treeIndent', '  ');
    const connectors = this.config.get('copytree.treeConnectors');
    
    lines.push(input.basePath);
    lines.push('');
    
    // Build tree structure
    const tree = this.buildTreeStructure(input.files);
    
    // Render tree
    this.renderTree(tree, lines, '', true);
    
    // Add summary
    lines.push('');
    lines.push(`${input.files.length} files, ${this.formatBytes(this.calculateTotalSize(input.files))}`);
    
    return lines.join('\n');
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
          // It's a file
          current[part] = {
            isFile: true,
            size: file.size,
            content: file.content
          };
        } else {
          // It's a directory
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
      // Directories first, then files
      const aIsFile = node[a].isFile;
      const bIsFile = node[b].isFile;
      
      if (aIsFile && !bIsFile) return 1;
      if (!aIsFile && bIsFile) return -1;
      
      return a.localeCompare(b);
    });
    
    entries.forEach(([name, value], index) => {
      const isLastEntry = index === entries.length - 1;
      const connector = isLastEntry 
        ? this.config.get('copytree.treeConnectors.last', '└── ')
        : this.config.get('copytree.treeConnectors.middle', '├── ');
      
      if (value.isFile) {
        lines.push(`${prefix}${connector}${name} (${this.formatBytes(value.size)})`);
      } else {
        lines.push(`${prefix}${connector}${name}/`);
        
        const extension = isLastEntry
          ? this.config.get('copytree.treeConnectors.empty', '    ')
          : this.config.get('copytree.treeConnectors.vertical', '│   ');
        
        this.renderTree(value, lines, prefix + extension, false);
      }
    });
  }

  addLineNumbersToContent(content) {
    if (!content) return content;
    
    const lines = content.split('\n');
    return lines.map((line, index) => {
      const lineNumber = (index + 1).toString();
      const formatted = this.lineNumberFormat.replace('%d', lineNumber).replace('%4d', lineNumber.padStart(4));
      return formatted + line;
    }).join('\n');
  }

  calculateTotalSize(files) {
    return files.reduce((total, file) => {
      return total + (file ? file.size : 0);
    }, 0);
  }

  generateDirectoryStructure(files) {
    const validFiles = files.filter(f => f !== null);
    if (validFiles.length === 0) return '';
    
    // Build tree structure
    const tree = this.buildTreeStructure(validFiles);
    
    // Render tree to string
    const lines = [];
    this.renderDirectoryTree(tree, lines, '', true);
    
    return lines.join('\n');
  }
  
  renderDirectoryTree(node, lines, prefix, isRoot) {
    const entries = Object.entries(node).sort(([a], [b]) => {
      // Directories first, then files
      const aIsFile = node[a].isFile;
      const bIsFile = node[b].isFile;
      
      if (aIsFile && !bIsFile) return 1;
      if (!aIsFile && bIsFile) return -1;
      
      return a.localeCompare(b);
    });
    
    entries.forEach(([name, value], index) => {
      const isLastEntry = index === entries.length - 1;
      const connector = isLastEntry ? '└── ' : '├── ';
      const isFile = value.isFile;
      
      lines.push(`${prefix}${connector}${name}${isFile ? '' : '/'}`);
      
      if (!isFile) {
        const extension = isLastEntry ? '    ' : '│   ';
        this.renderDirectoryTree(value, lines, prefix + extension, false);
      }
    });
  }
}

module.exports = OutputFormattingStage;