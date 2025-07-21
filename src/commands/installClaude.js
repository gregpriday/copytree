const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const inquirer = require('inquirer');
const { logger } = require('../utils/logger');
const { CommandError } = require('../utils/errors');

/**
 * Install Claude integration by creating/updating mcp.json
 */
async function installClaudeCommand(options = {}) {
  try {
    console.log(chalk.blue.bold('Installing Claude Code Integration\n'));
    
    const projectRoot = process.cwd();
    const mcpJsonPath = path.join(projectRoot, 'mcp.json');
    const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');
    
    // Step 1: Handle mcp.json
    console.log(chalk.blue('Setting up MCP configuration...'));
    
    let mcpConfig = { mcpServers: {} };
    let mcpExists = await fs.pathExists(mcpJsonPath);
    
    if (mcpExists) {
      try {
        const existingConfig = await fs.readJson(mcpJsonPath);
        mcpConfig = existingConfig;
        console.log(chalk.green('✓') + ' Found existing mcp.json');
        
        // Check if copytree is already configured
        if (mcpConfig.mcpServers?.copytree) {
          console.log(chalk.yellow('⚠ CopyTree MCP server already configured'));
          
          if (!options.force) {
            const { overwrite } = await inquirer.prompt([{
              type: 'confirm',
              name: 'overwrite',
              message: 'Overwrite existing CopyTree configuration?',
              default: false
            }]);
            
            if (!overwrite) {
              console.log(chalk.yellow('Skipping MCP configuration update'));
              return;
            }
          }
        }
      } catch (error) {
        console.log(chalk.red('✗') + ` Failed to parse existing mcp.json: ${error.message}`);
        console.log(chalk.yellow('Creating new mcp.json'));
        mcpConfig = { mcpServers: {} };
      }
    }
    
    // Add CopyTree MCP server configuration
    mcpConfig.mcpServers.copytree = {
      command: "copytree",
      args: ["mcp"],
      env: {},
      workingDirectory: projectRoot
    };
    
    // Write mcp.json
    await fs.writeJson(mcpJsonPath, mcpConfig, { spaces: 2 });
    console.log(chalk.green('✓') + ` Created/updated mcp.json`);
    
    // Step 2: Handle CLAUDE.md (optional)
    const claudeMdExists = await fs.pathExists(claudeMdPath);
    
    if (claudeMdExists) {
      console.log(chalk.blue('\nUpdating CLAUDE.md...'));
      
      const existingContent = await fs.readFile(claudeMdPath, 'utf8');
      
      // Check if CopyTree instructions already exist
      const hasInstructions = existingContent.includes('CopyTree MCP Server') || 
                             existingContent.includes('project_ask tool');
      
      if (hasInstructions && !options.force && !options.append) {
        console.log(chalk.yellow('⚠ CLAUDE.md already contains CopyTree instructions'));
        
        const { append } = await inquirer.prompt([{
          type: 'confirm',
          name: 'append',
          message: 'Add CopyTree instructions to CLAUDE.md anyway?',
          default: false
        }]);
        
        if (!append) {
          console.log(chalk.yellow('Skipping CLAUDE.md update'));
        } else {
          await appendClaudeInstructions(claudeMdPath, existingContent);
        }
      } else if (options.append || !hasInstructions) {
        await appendClaudeInstructions(claudeMdPath, existingContent);
      }
    } else {
      console.log(chalk.blue('\nCreating CLAUDE.md with CopyTree instructions...'));
      const instructions = getClaudeInstructions();
      await fs.writeFile(claudeMdPath, instructions);
      console.log(chalk.green('✓') + ' Created CLAUDE.md with CopyTree instructions');
    }
    
    // Step 3: Success message and instructions
    console.log(chalk.green.bold('\n✓ Claude Code integration installed successfully!\n'));
    
    console.log(chalk.bold('Next steps:'));
    console.log(chalk.gray('1. Restart Claude Code to load the new MCP server'));
    console.log(chalk.gray('2. Use the project_ask tool to query your codebase'));
    console.log(chalk.gray('3. Try: "What is the main purpose of this project?"'));
    
    console.log(chalk.bold('\nExample usage in Claude Code:'));
    console.log(chalk.cyan('  • "How does the authentication system work?"'));
    console.log(chalk.cyan('  • "Where is the database connection configured?"'));
    console.log(chalk.cyan('  • "Explain how the user registration process works"'));
    console.log(chalk.cyan('  • "What tests are failing and why?"'));
    
    console.log(chalk.bold('\nMCP server configured:'));
    console.log(chalk.gray(`  Command: copytree mcp`));
    console.log(chalk.gray(`  Working Directory: ${projectRoot}`));
    
  } catch (error) {
    logger.error('Failed to install Claude integration', { 
      error: error.message,
      stack: error.stack 
    });
    throw new CommandError(
      `Failed to install Claude integration: ${error.message}`,
      'install:claude'
    );
  }
}

/**
 * Append CopyTree instructions to CLAUDE.md
 */
async function appendClaudeInstructions(claudeMdPath, existingContent) {
  const instructions = getClaudeInstructions();
  const updatedContent = existingContent + '\n\n' + instructions;
  await fs.writeFile(claudeMdPath, updatedContent);
  console.log(chalk.green('✓') + ' Updated CLAUDE.md with CopyTree instructions');
}

/**
 * Get CopyTree instructions for CLAUDE.md
 */
function getClaudeInstructions() {
  return `## CopyTree MCP Server

This project has CopyTree's \`project_ask\` tool for querying the codebase using natural language.

### Available Tools

- **project_ask**: Ask questions about the codebase, architecture, implementations, or debug issues
- **project_copy**: Generate structured XML output of project files

### Example Queries

- "What is the main purpose of this project?"
- "How does the authentication system work?"
- "Where is X implemented?"
- "Why is this test failing?"
- "Show me the database schema"
- "Explain the API endpoints"

### Advanced Features

- **Stateful conversations**: Use \`state\` parameter to maintain context across questions
- **Streaming responses**: Use \`stream: true\` for real-time answers
- **File filtering**: Ask about specific files, directories, or patterns
- **Git integration**: Query modified files, recent changes, or branch differences

### Usage Tips

1. Ask specific questions about code functionality
2. Request explanations of complex algorithms or patterns  
3. Debug failing tests or error messages
4. Understand project architecture and data flow
5. Get help with code reviews and refactoring

The CopyTree MCP server provides deep codebase understanding through AI-powered analysis.`;
}

module.exports = installClaudeCommand;