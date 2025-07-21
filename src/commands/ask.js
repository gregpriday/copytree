const { AIService } = require('../services/AIService');
const { conversations } = require('../services/ConversationService');
const { logger } = require('../utils/logger');
const { config } = require('../config/ConfigManager');
const { CommandError, handleError } = require('../utils/errors');
const copyCommand = require('./copy');
const chalk = require('chalk');
const ora = require('ora');

/**
 * Ask command - Interactive AI conversation about the codebase
 */
async function askCommand(query, options = {}) {
  try {
    // Initialize AI service
    const ai = AIService.forTask('ask', options);
    
    // Handle conversation state
    let conversationId = options.state;
    let conversation;
    
    if (conversationId) {
      // Resume existing conversation
      conversation = await conversations.getConversation(conversationId);
      if (!conversation) {
        logger.warn(`Conversation ${conversationId} not found, starting new conversation`);
        conversationId = null;
      }
    }
    
    if (!conversationId) {
      // Create new conversation
      conversationId = await conversations.createConversation({
        project: process.cwd(),
        profile: options.profile
      });
      conversation = await conversations.getConversation(conversationId);
      
      // Generate context from codebase
      const context = await generateCodebaseContext(options);
      await conversations.updateContext(conversationId, { codebase: context });
      
      logger.info(`Started new conversation: ${conversationId}`);
    }
    
    // Add user message
    await conversations.addMessage(conversationId, {
      role: 'user',
      content: query
    });
    
    // Prepare messages for AI
    const messages = prepareMessages(conversation, query);
    
    // Show spinner or stream response
    if (options.stream !== false) {
      // Stream response
      console.log('\n' + chalk.blue('Assistant:'));
      
      let response = '';
      await ai.streamChat({ messages }, (chunk) => {
        process.stdout.write(chunk);
        response += chunk;
      });
      
      console.log('\n');
      
      // Save assistant response
      await conversations.addMessage(conversationId, {
        role: 'assistant',
        content: response
      });
    } else {
      // Non-streaming response
      const spinner = ora('Thinking...').start();
      
      const result = await ai.chat({ messages });
      
      spinner.stop();
      
      console.log('\n' + chalk.blue('Assistant:'));
      console.log(result.content);
      console.log();
      
      // Save assistant response
      await conversations.addMessage(conversationId, {
        role: 'assistant',
        content: result.content
      });
    }
    
    // Show conversation info
    console.log(chalk.gray(`Conversation ID: ${conversationId}`));
    console.log(chalk.gray(`To continue this conversation, use: copytree ask "your question" --state ${conversationId}`));
    
  } catch (error) {
    handleError(error, {
      exit: true,
      verbose: options.verbose || config().get('app.verboseErrors', false)
    });
  }
}

/**
 * Generate codebase context for the conversation
 */
async function generateCodebaseContext(options) {
  try {
    logger.info('Analyzing codebase for context...');
    
    // Use copy command to get codebase structure
    const copyOptions = {
      ...options,
      format: 'json',
      charLimit: 50000, // Limit context size
      stream: false,
      display: false
    };
    
    // Mock the output handling
    const originalLog = console.log;
    const originalWrite = process.stdout.write;
    let capturedOutput = '';
    
    console.log = () => {};
    process.stdout.write = (data) => {
      capturedOutput += data;
      return true;
    };
    
    try {
      // Run copy command internally
      await copyCommand('.', copyOptions);
    } finally {
      // Restore console
      console.log = originalLog;
      process.stdout.write = originalWrite;
    }
    
    // Parse the output
    if (capturedOutput) {
      const data = JSON.parse(capturedOutput);
      
      // Create a summary of the codebase
      const summary = {
        directory: data.directory,
        fileCount: data.metadata.fileCount,
        totalSize: data.metadata.totalSize,
        profile: data.metadata.profile,
        fileTypes: countFileTypes(data.files),
        structure: generateStructureSummary(data.files)
      };
      
      return {
        summary,
        files: data.files.slice(0, 20) // Include first 20 files for context
      };
    }
    
  } catch (error) {
    logger.warn(`Failed to generate codebase context: ${error.message}`);
    return {
      error: 'Failed to analyze codebase',
      directory: process.cwd()
    };
  }
}

/**
 * Prepare messages for AI including context
 */
function prepareMessages(conversation, currentQuery) {
  const messages = [];
  
  // Add system prompt with context
  let systemPrompt = `You are an AI assistant helping with a software project. You have access to information about the codebase structure and can answer questions about it.

Current Project: ${conversation.metadata.project}`;

  if (conversation.context.codebase) {
    const ctx = conversation.context.codebase;
    if (ctx.summary) {
      systemPrompt += `\n\nCodebase Summary:
- Directory: ${ctx.summary.directory}
- Total Files: ${ctx.summary.fileCount}
- File Types: ${JSON.stringify(ctx.summary.fileTypes)}`;
      
      if (ctx.files && ctx.files.length > 0) {
        systemPrompt += '\n\nSample Files:';
        ctx.files.slice(0, 10).forEach(file => {
          systemPrompt += `\n- ${file.path} (${file.size} bytes)`;
        });
      }
    }
  }
  
  messages.push({ role: 'system', content: systemPrompt });
  
  // Add conversation history (last 10 messages)
  const history = conversations.formatForAI(conversation, 10);
  messages.push(...history);
  
  return messages;
}

/**
 * Count file types in the codebase
 */
function countFileTypes(files) {
  const types = {};
  
  for (const file of files) {
    const ext = file.path.match(/\.[^.]+$/)?.[0] || 'no-extension';
    types[ext] = (types[ext] || 0) + 1;
  }
  
  // Sort by count and return top 10
  return Object.entries(types)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .reduce((acc, [ext, count]) => {
      acc[ext] = count;
      return acc;
    }, {});
}

/**
 * Generate structure summary
 */
function generateStructureSummary(files) {
  const dirs = new Set();
  
  for (const file of files) {
    const parts = file.path.split('/');
    if (parts.length > 1) {
      dirs.add(parts[0]);
    }
  }
  
  return Array.from(dirs).sort().slice(0, 10);
}

module.exports = askCommand;