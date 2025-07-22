const Stage = require('../Stage');
const { create } = require('xmlbuilder2');
const path = require('path');

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
        output = this.formatAsXML(input);
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

  formatAsXML(input) {
    const root = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('directory', { path: input.basePath });

    // Add metadata
    const metadata = root.ele('metadata');
    metadata.ele('generated').txt(new Date().toISOString());
    metadata.ele('fileCount').txt(input.files.length.toString());
    metadata.ele('totalSize').txt(this.calculateTotalSize(input.files).toString());
    
    if (input.profile) {
      metadata.ele('profile').txt(input.profile.name || 'default');
    }
    
    // Add git metadata if present
    if (input.gitMetadata) {
      const gitElement = metadata.ele('git');
      if (input.gitMetadata.branch) {
        gitElement.ele('branch').txt(input.gitMetadata.branch);
      }
      if (input.gitMetadata.lastCommit) {
        gitElement.ele('lastCommit', {
          hash: input.gitMetadata.lastCommit.hash
        }).txt(input.gitMetadata.lastCommit.message);
      }
      if (input.gitMetadata.filterType) {
        gitElement.ele('filterType').txt(input.gitMetadata.filterType);
      }
      gitElement.ele('hasUncommittedChanges').txt(
        input.gitMetadata.hasUncommittedChanges ? 'true' : 'false'
      );
    }
    
    // Add directory structure to metadata
    const directoryStructure = this.generateDirectoryStructure(input.files);
    if (directoryStructure) {
      metadata.ele('directoryStructure').txt(directoryStructure);
    }

    // Add files
    const filesElement = root.ele('files');
    
    for (const file of input.files) {
      if (file === null) continue; // Skip files that were filtered out
      
      const fileElement = filesElement.ele('file', { 
        path: file.path,
        size: file.size.toString()
      });
      
      if (file.modified) {
        const modifiedDate = file.modified instanceof Date 
          ? file.modified 
          : new Date(file.modified);
        fileElement.att('modified', modifiedDate.toISOString());
      }
      
      if (file.isBinary) {
        fileElement.att('binary', 'true');
        if (file.encoding) {
          fileElement.att('encoding', file.encoding);
        }
      }
      
      if (file.gitStatus) {
        fileElement.att('gitStatus', file.gitStatus);
      }
      
      // Add content (unless --only-tree is set)
      if (!this.onlyTree) {
        let content = file.content || '';
        
        if (this.addLineNumbers && !file.isBinary) {
          content = this.addLineNumbersToContent(content);
        }
        
        fileElement.ele('content').txt(content);
      }
    }

    const prettyPrint = this.config.get('app.prettyPrint', true);
    return root.end({ prettyPrint });
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