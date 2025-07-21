const readline = require('readline');
const { logger } = require('../utils/logger');
const { Pipeline } = require('../pipeline/Pipeline');
const { AIService } = require('../services/AIService');
const ProfileLoader = require('../profiles/ProfileLoader');
const path = require('path');
const fs = require('fs-extra');

/**
 * MCP (Model Context Protocol) Server for CopyTree
 * Provides tools for Claude to interact with the codebase
 */
class McpServer {
  constructor(options = {}) {
    this.workingDirectory = options.workingDirectory || process.cwd();
    this.port = options.port || 'stdio';
    this.debug = options.debug || false;
    this.logger = logger.child('McpServer');
    this.aiService = new AIService();
    this.profileLoader = new ProfileLoader();
    
    // State management for conversations
    this.conversationStates = new Map();
  }

  /**
   * Start the MCP server
   */
  async start() {
    this.logger.info('Starting MCP server', {
      workingDirectory: this.workingDirectory,
      port: this.port
    });

    if (this.port === 'stdio') {
      await this.startStdioServer();
    } else {
      await this.startTcpServer(this.port);
    }
  }

  /**
   * Start stdio-based server (default for Claude)
   */
  async startStdioServer() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    // Send server info
    this.sendResponse({
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
        sampling: {}
      },
      serverInfo: {
        name: 'copytree-mcp',
        version: '1.0.0'
      }
    });

    // Process incoming requests
    rl.on('line', async (line) => {
      try {
        const request = JSON.parse(line);
        await this.handleRequest(request);
      } catch (error) {
        this.logger.error('Failed to process request', {
          error: error.message,
          line
        });
        this.sendError(error.message);
      }
    });
  }

  /**
   * Handle incoming MCP request
   */
  async handleRequest(request) {
    const { method, params, id } = request;

    switch (method) {
      case 'initialize':
        await this.handleInitialize(params, id);
        break;
        
      case 'tools/list':
        await this.handleToolsList(id);
        break;
        
      case 'tools/call':
        await this.handleToolCall(params, id);
        break;
        
      default:
        this.sendError(`Unknown method: ${method}`, id);
    }
  }

  /**
   * Handle initialize request
   */
  async handleInitialize(params, id) {
    this.sendResponse({
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
        sampling: {}
      },
      serverInfo: {
        name: 'copytree-mcp',
        version: '1.0.0'
      }
    }, id);
  }

  /**
   * Handle tools/list request
   */
  async handleToolsList(id) {
    const tools = [
      {
        name: 'project_ask',
        description: 'Ask questions about the codebase using natural language',
        inputSchema: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'The question to ask about the codebase'
            },
            context: {
              type: 'string',
              description: 'Optional context or specific area to focus on'
            },
            state: {
              type: 'string',
              description: 'Optional conversation state ID for follow-up questions'
            },
            stream: {
              type: 'boolean',
              description: 'Whether to stream the response',
              default: false
            }
          },
          required: ['question']
        }
      },
      {
        name: 'project_copy',
        description: 'Generate structured output of project files',
        inputSchema: {
          type: 'object',
          properties: {
            profile: {
              type: 'string',
              description: 'Profile to use (default, minimal, etc.)'
            },
            filter: {
              type: 'string',
              description: 'Natural language filter for files'
            },
            format: {
              type: 'string',
              enum: ['xml', 'json', 'tree'],
              description: 'Output format',
              default: 'xml'
            },
            gitFilter: {
              type: 'string',
              enum: ['modified', 'staged', 'untracked'],
              description: 'Filter by git status'
            },
            limit: {
              type: 'number',
              description: 'Character limit for output'
            }
          }
        }
      },
      {
        name: 'list_files',
        description: 'List files in the project with optional filtering',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Directory path to list (relative to working directory)'
            },
            pattern: {
              type: 'string',
              description: 'Glob pattern to filter files'
            },
            includeHidden: {
              type: 'boolean',
              description: 'Include hidden files',
              default: false
            }
          }
        }
      },
      {
        name: 'read_file',
        description: 'Read the contents of a specific file',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'File path to read (relative to working directory)'
            },
            encoding: {
              type: 'string',
              description: 'File encoding',
              default: 'utf8'
            }
          },
          required: ['path']
        }
      },
      {
        name: 'search_files',
        description: 'Search for text or patterns in files',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query (supports regex)'
            },
            path: {
              type: 'string',
              description: 'Directory to search in'
            },
            filePattern: {
              type: 'string',
              description: 'File pattern to search (e.g., *.js)'
            },
            caseSensitive: {
              type: 'boolean',
              description: 'Case sensitive search',
              default: false
            }
          },
          required: ['query']
        }
      },
      {
        name: 'get_file_tree',
        description: 'Get project file tree structure',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Root path for tree'
            },
            maxDepth: {
              type: 'number',
              description: 'Maximum depth to traverse',
              default: 3
            },
            includeHidden: {
              type: 'boolean',
              description: 'Include hidden files and directories',
              default: false
            }
          }
        }
      }
    ];

    this.sendResponse({ tools }, id);
  }

  /**
   * Handle tools/call request
   */
  async handleToolCall(params, id) {
    const { name, arguments: args } = params;

    try {
      let result;
      
      switch (name) {
        case 'project_ask':
          result = await this.handleProjectAsk(args);
          break;
          
        case 'project_copy':
          result = await this.handleProjectCopy(args);
          break;
          
        case 'list_files':
          result = await this.handleListFiles(args);
          break;
          
        case 'read_file':
          result = await this.handleReadFile(args);
          break;
          
        case 'search_files':
          result = await this.handleSearchFiles(args);
          break;
          
        case 'get_file_tree':
          result = await this.handleGetFileTree(args);
          break;
          
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      this.sendResponse({
        content: [{ type: 'text', text: result }]
      }, id);
    } catch (error) {
      this.logger.error('Tool call failed', {
        tool: name,
        error: error.message
      });
      this.sendError(`Tool ${name} failed: ${error.message}`, id);
    }
  }

  /**
   * Handle project_ask tool
   */
  async handleProjectAsk(args) {
    const { question, context, state, stream } = args;
    
    // Get or create conversation state
    const stateId = state || this.generateStateId();
    let conversationState = this.conversationStates.get(stateId);
    
    if (!conversationState) {
      conversationState = {
        id: stateId,
        history: [],
        context: {}
      };
      this.conversationStates.set(stateId, conversationState);
    }

    // Generate project context
    const projectContext = await this.generateProjectContext(context);
    
    // Build prompt with history
    const prompt = this.buildPrompt(question, projectContext, conversationState.history);
    
    // Get AI response
    const response = await this.aiService.generate(prompt, {
      stream,
      temperature: 0.3,
      maxTokens: 2000
    });
    
    // Update conversation history
    conversationState.history.push({
      question,
      answer: response,
      timestamp: new Date().toISOString()
    });
    
    // Limit history size
    if (conversationState.history.length > 10) {
      conversationState.history.shift();
    }
    
    return response;
  }

  /**
   * Handle project_copy tool
   */
  async handleProjectCopy(args) {
    const { profile = 'default', filter, format = 'xml', gitFilter, limit } = args;
    
    // Create pipeline with options
    const pipeline = new Pipeline({
      basePath: this.workingDirectory,
      profile,
      outputFormat: format,
      characterLimit: limit,
      gitFilter,
      aiFilter: filter
    });
    
    // Run pipeline
    const result = await pipeline.run();
    
    return result.output;
  }

  /**
   * Handle list_files tool
   */
  async handleListFiles(args) {
    const { path: relPath = '.', pattern = '**/*', includeHidden = false } = args;
    const fullPath = path.join(this.workingDirectory, relPath);
    
    const { globby } = await import('globby');
    const files = await globby(pattern, {
      cwd: fullPath,
      dot: includeHidden,
      onlyFiles: true
    });
    
    return files.join('\n');
  }

  /**
   * Handle read_file tool
   */
  async handleReadFile(args) {
    const { path: filePath, encoding = 'utf8' } = args;
    const fullPath = path.join(this.workingDirectory, filePath);
    
    if (!await fs.pathExists(fullPath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    const content = await fs.readFile(fullPath, encoding);
    return content;
  }

  /**
   * Handle search_files tool
   */
  async handleSearchFiles(args) {
    const { query, path: searchPath = '.', filePattern = '**/*', caseSensitive = false } = args;
    const fullPath = path.join(this.workingDirectory, searchPath);
    
    const { globby } = await import('globby');
    const files = await globby(filePattern, {
      cwd: fullPath,
      onlyFiles: true
    });
    
    const results = [];
    const regex = new RegExp(query, caseSensitive ? 'g' : 'gi');
    
    for (const file of files) {
      const content = await fs.readFile(path.join(fullPath, file), 'utf8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        if (regex.test(line)) {
          results.push({
            file,
            line: index + 1,
            content: line.trim()
          });
        }
      });
    }
    
    return results.map(r => `${r.file}:${r.line}: ${r.content}`).join('\n');
  }

  /**
   * Handle get_file_tree tool
   */
  async handleGetFileTree(args) {
    const { path: treePath = '.', maxDepth = 3, includeHidden = false } = args;
    const fullPath = path.join(this.workingDirectory, treePath);
    
    const tree = await this.buildFileTree(fullPath, '', 0, maxDepth, includeHidden);
    return tree;
  }

  /**
   * Build file tree recursively
   */
  async buildFileTree(dirPath, prefix, depth, maxDepth, includeHidden) {
    if (depth > maxDepth) return '';
    
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const filtered = entries.filter(e => includeHidden || !e.name.startsWith('.'));
    const sorted = filtered.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) {
        return a.isDirectory() ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    
    let tree = '';
    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i];
      const isLast = i === sorted.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const extension = isLast ? '    ' : '│   ';
      
      tree += prefix + connector + entry.name + '\n';
      
      if (entry.isDirectory() && depth < maxDepth) {
        const subPath = path.join(dirPath, entry.name);
        const subTree = await this.buildFileTree(
          subPath,
          prefix + extension,
          depth + 1,
          maxDepth,
          includeHidden
        );
        tree += subTree;
      }
    }
    
    return tree;
  }

  /**
   * Generate project context for AI
   */
  async generateProjectContext(focusArea) {
    // TODO: Implement smart context generation based on focus area
    const context = {
      projectPath: this.workingDirectory,
      projectName: path.basename(this.workingDirectory)
    };
    
    return JSON.stringify(context);
  }

  /**
   * Build AI prompt with history
   */
  buildPrompt(question, projectContext, history) {
    let prompt = `You are analyzing a codebase. Here's the context:\n\n`;
    prompt += `Project: ${projectContext}\n\n`;
    
    if (history.length > 0) {
      prompt += `Previous conversation:\n`;
      history.slice(-3).forEach(h => {
        prompt += `Q: ${h.question}\nA: ${h.answer}\n\n`;
      });
    }
    
    prompt += `Current question: ${question}\n\n`;
    prompt += `Please provide a clear, concise answer focused on the codebase.`;
    
    return prompt;
  }

  /**
   * Generate unique state ID
   */
  generateStateId() {
    return `state_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Send response
   */
  sendResponse(result, id) {
    const response = {
      jsonrpc: '2.0',
      result,
      ...(id && { id })
    };
    
    if (this.debug) {
      this.logger.debug('Sending response', response);
    }
    
    console.log(JSON.stringify(response));
  }

  /**
   * Send error
   */
  sendError(message, id) {
    const response = {
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message
      },
      ...(id && { id })
    };
    
    console.log(JSON.stringify(response));
  }

  /**
   * Stop the server
   */
  async stop() {
    this.logger.info('Stopping MCP server');
    // Clean up resources
    this.conversationStates.clear();
  }
}

module.exports = { McpServer };