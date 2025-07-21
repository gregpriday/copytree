# Command-by-Command Migration Guide

## Overview

This guide provides detailed implementation instructions for migrating each CopyTree command from PHP to Node.js, including code patterns, logic flow, and special considerations.

## 1. CopyTreeCommand (Main Command)

### PHP Signature
```php
protected $signature = '
    copy {path? : The directory to copy} 
    {--profile=default : Profile to use}
    {--filter=* : Additional filter patterns}
    {--ai-filter= : Natural language file selection}
    {--modified : Only git modified files}
    {--changed= : Git changes between commits}
    {--output= : Output to file}
    {--display : Display output}
    {--stream : Stream output}
    {--dry-run : Preview without processing}
    {--head= : Limit files}
    {--char-limit= : Character limit}
    {--include-binary : Include binary files}
    {--external=* : External sources}
    {--with-line-numbers : Add line numbers}
    {--info : Show info table}
    {--show-size : Show file sizes}
    {--with-git-status : Include git status}
';
```

### Node.js Implementation Structure

```javascript
// src/commands/copy.js
const { Pipeline } = require('../pipeline');
const { ProfileLoader } = require('../profiles/ProfileLoader');
const { GitUtils } = require('../utils/gitUtils');
const { AIFilter } = require('../utils/aiFilter');
const { OutputRenderer } = require('../renderer/OutputRenderer');

async function copyCommand(path = '.', options) {
    // 1. Profile Detection and Loading
    const profileLoader = new ProfileLoader();
    let profileName = options.profile;
    
    if (profileName === 'auto') {
        const ProfileGuesser = require('../profiles/ProfileGuesser');
        const guesser = new ProfileGuesser(path);
        profileName = await guesser.guess();
    }
    
    const profile = await profileLoader.load(profileName, {
        filter: options.filter,
        aiFilter: options.aiFilter,
        // ... merge other options
    });
    
    // 2. Initialize Pipeline
    const pipeline = new Pipeline();
    const stages = [];
    
    // 3. Git Integration
    if (options.modified || options.changed) {
        const GitFilterStage = require('../pipeline/stages/GitFilterStage');
        stages.push(new GitFilterStage({
            modified: options.modified,
            changed: options.changed,
            basePath: path
        }));
    }
    
    // 4. AI Filtering
    if (options.aiFilter) {
        const AIFilterStage = require('../pipeline/stages/AIFilterStage');
        stages.push(new AIFilterStage({
            query: options.aiFilter,
            provider: config.get('ai.provider')
        }));
    }
    
    // 5. External Sources
    if (options.external && options.external.length) {
        const ExternalSourceStage = require('../pipeline/stages/ExternalSourceStage');
        stages.push(new ExternalSourceStage({
            sources: options.external
        }));
    }
    
    // 6. File Processing
    stages.push(
        require('../pipeline/stages/FileLoaderStage'),
        require('../pipeline/stages/RulesetFilterStage'),
        require('../pipeline/stages/TransformStage'),
        require('../pipeline/stages/DeduplicateStage'),
        require('../pipeline/stages/SortStage')
    );
    
    // 7. Execute Pipeline
    const files = await pipeline
        .through(stages)
        .process({ path, profile });
    
    // 8. Output Handling
    const renderer = new OutputRenderer({
        withLineNumbers: options.withLineNumbers,
        showSize: options.showSize,
        withGitStatus: options.withGitStatus
    });
    
    const output = await renderer.render(files, {
        profile: profileName,
        sourcePath: path
    });
    
    // 9. Output Destination
    if (options.output) {
        await outputToFile(output, options.output);
    } else if (options.display) {
        console.log(output);
    } else if (options.stream) {
        process.stdout.write(output);
    } else {
        await copyToClipboard(output);
    }
    
    // 10. Info Display
    if (options.info) {
        displayInfoTable(files, output);
    }
}

module.exports = copyCommand;
```

### Key Implementation Points

1. **Profile System**: 
   - Auto-detection based on project files
   - Merge command options with profile settings
   - Support for custom profiles in `.ctree/` directory

2. **Pipeline Architecture**:
   - Each stage processes files sequentially
   - Stages can add, remove, or transform files
   - Support for progress tracking

3. **Output Formats**:
   - XML structure with metadata
   - Tree view rendering
   - Character limit enforcement

4. **Performance Considerations**:
   - Stream large files instead of loading into memory
   - Parallel file transformations where possible
   - Cache AI responses

## 2. AskCommand

### PHP Signature
```php
protected $signature = 'ask {query : Your question}
    {--state= : Continue conversation}
    {--p|path= : Project path}
    {--model= : AI model}
    {--provider= : AI provider}
    {--dry-run : Preview without asking}
    {--stream : Stream response}';
```

### Node.js Implementation

```javascript
// src/commands/ask.js
const { ConversationStateService } = require('../services/ConversationStateService');
const { ProjectQuestionService } = require('../services/ProjectQuestionService');
const { AIProviderFactory } = require('../ai/AIProviderFactory');

async function askCommand(query, options) {
    // 1. Load or create conversation state
    const stateService = new ConversationStateService();
    let conversationId = options.state || generateConversationId();
    let history = [];
    
    if (options.state) {
        history = await stateService.loadState(conversationId);
    }
    
    // 2. Generate project context
    const projectPath = options.path || process.cwd();
    const copytree = await generateProjectContext(projectPath, {
        aiFilter: query // Use query as context filter
    });
    
    // 3. Set up AI provider
    const provider = AIProviderFactory.create(
        options.provider || config.get('ai.defaultProvider'),
        options.model
    );
    
    // 4. Ask question
    const questionService = new ProjectQuestionService(provider);
    
    if (options.stream) {
        // Stream response
        const stream = await questionService.askQuestionStream(
            copytree,
            query,
            history
        );
        
        let fullResponse = '';
        for await (const chunk of stream) {
            process.stdout.write(chunk.text);
            fullResponse += chunk.text;
        }
        
        // Save to history
        history.push({ role: 'user', content: query });
        history.push({ role: 'assistant', content: fullResponse });
    } else {
        // Non-streaming response
        const response = await questionService.askQuestion(
            copytree,
            query,
            history
        );
        console.log(response.text);
        
        // Update history
        history.push({ role: 'user', content: query });
        history.push({ role: 'assistant', content: response.text });
    }
    
    // 5. Save conversation state
    await stateService.saveState(conversationId, history);
    console.log(`\nConversation ID: ${conversationId}`);
    
    // 6. Display token usage
    if (response.usage) {
        displayTokenUsage(response.usage);
    }
}

// Helper to generate conversation ID
function generateConversationId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
```

### Implementation Notes

1. **Conversation State**: Store in `~/.copytree/conversations/`
2. **Context Generation**: Reuse main copy logic with focused filtering
3. **Streaming**: Use async iterators for real-time output
4. **Token Tracking**: Display usage and cost estimates

## 3. CreateProfileCommand

### PHP Signature
```php
protected $signature = 'profile:create 
    {path? : Project directory}
    {name? : Profile name}
    {--char-limit=150000 : Character limit}
    {--ai : Use AI for generation}';
```

### Node.js Implementation

```javascript
// src/commands/profileCreate.js
const { ProfileCreationService } = require('../services/ProfileCreationService');
const { ProfileValidator } = require('../profiles/ProfileValidator');
const inquirer = require('inquirer');

async function createProfileCommand(path = '.', name, options) {
    const service = new ProfileCreationService();
    
    if (options.ai) {
        // AI-powered profile creation
        console.log('Analyzing project structure...');
        
        const profile = await service.createWithAI(path, {
            charLimit: options.charLimit,
            name: name
        });
        
        // Preview profile
        console.log('\nGenerated Profile:');
        console.log(yaml.dump(profile));
        
        // Confirm save
        const { confirm } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirm',
            message: 'Save this profile?',
            default: true
        }]);
        
        if (confirm) {
            const profilePath = await service.save(profile, name);
            console.log(`Profile saved to: ${profilePath}`);
        }
    } else {
        // Interactive profile creation
        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'name',
                message: 'Profile name:',
                default: name || path.basename(path)
            },
            {
                type: 'input',
                name: 'description',
                message: 'Profile description:'
            },
            {
                type: 'checkbox',
                name: 'includeDirs',
                message: 'Directories to include:',
                choices: await getDirectoryChoices(path)
            },
            {
                type: 'input',
                name: 'includePatterns',
                message: 'Include patterns (comma-separated):'
            },
            {
                type: 'input',
                name: 'excludePatterns',
                message: 'Exclude patterns (comma-separated):'
            }
        ]);
        
        const profile = service.createFromAnswers(answers);
        await service.save(profile, answers.name);
    }
}
```

### Note on AI Profile Creation

Per the migration document, AI-powered profile creation will not be included in the Node.js version as there are better approaches now.

## 4. WatchCommand

### PHP Signature
```php
protected $signature = 'watch 
    {path? : Directory to watch}
    {--filter=* : Filter patterns}
    {--profile=default : Profile to use}
    {--full : Output full content}';
```

### Node.js Implementation

```javascript
// src/commands/watch.js
const chokidar = require('chokidar');
const { debounce } = require('lodash');

async function watchCommand(path = '.', options) {
    console.log(`Watching ${path} for changes...`);
    
    // Load profile and filters
    const profile = await loadProfile(options.profile);
    const filter = createFilter(profile, options.filter);
    
    // Track file states
    const fileStates = new Map();
    
    // Initialize watcher
    const watcher = chokidar.watch(path, {
        ignored: [
            /(^|[\/\\])\../, // Hidden files
            /node_modules/,
            /.git/,
            ...profile.exclude
        ],
        persistent: true,
        ignoreInitial: false
    });
    
    // Debounced update function
    const processChanges = debounce(async () => {
        const changes = detectChanges(fileStates);
        if (changes.length === 0) return;
        
        console.clear();
        console.log(`Detected ${changes.length} changes:\n`);
        
        if (options.full) {
            // Generate full copytree output
            const output = await generateCopytreeOutput(path, {
                ...options,
                filter: changes.map(c => c.path)
            });
            await copyToClipboard(output);
        } else {
            // Just list changes
            changes.forEach(change => {
                console.log(`${change.type}: ${change.path}`);
            });
        }
        
        console.log('\nCopied to clipboard!');
    }, 1000);
    
    // Watch events
    watcher
        .on('add', path => {
            if (filter.accept(path)) {
                fileStates.set(path, { mtime: Date.now(), type: 'added' });
                processChanges();
            }
        })
        .on('change', path => {
            if (filter.accept(path)) {
                fileStates.set(path, { mtime: Date.now(), type: 'changed' });
                processChanges();
            }
        })
        .on('unlink', path => {
            fileStates.delete(path);
            processChanges();
        });
    
    // Handle exit
    process.on('SIGINT', () => {
        console.log('\nStopping watch...');
        watcher.close();
        process.exit(0);
    });
}
```

## 5. InstallClaudeCommand

### PHP Implementation Notes
- Creates VS Code tasks.json
- Adds keyboard shortcuts
- Configures Claude Code integration

### Node.js Implementation

```javascript
// src/commands/installClaude.js
const fs = require('fs-extra');
const path = require('path');

async function installClaudeCommand() {
    const vscodeDir = path.join(process.cwd(), '.vscode');
    await fs.ensureDir(vscodeDir);
    
    // 1. Create tasks.json
    const tasksPath = path.join(vscodeDir, 'tasks.json');
    const tasks = {
        version: "2.0.0",
        tasks: [
            {
                label: "CopyTree to Clipboard",
                type: "shell",
                command: "copytree",
                args: ["${workspaceFolder}"],
                problemMatcher: [],
                group: {
                    kind: "build",
                    isDefault: false
                }
            }
        ]
    };
    
    await fs.writeJson(tasksPath, tasks, { spaces: 2 });
    console.log('✓ Created .vscode/tasks.json');
    
    // 2. Create keybindings suggestion
    console.log('\nAdd this to your keybindings.json:');
    console.log(JSON.stringify({
        key: "cmd+shift+c",
        command: "workbench.action.tasks.runTask",
        args: "CopyTree to Clipboard"
    }, null, 2));
    
    // 3. Create CLAUDE.md template
    const claudeMdPath = path.join(process.cwd(), 'CLAUDE.md');
    if (!await fs.pathExists(claudeMdPath)) {
        const template = `# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview
[Describe your project here]

## Key Technologies
- [List main technologies]

## Project Structure
[Describe important directories and files]

## Development Guidelines
[Any specific patterns or practices Claude should follow]
`;
        await fs.writeFile(claudeMdPath, template);
        console.log('\n✓ Created CLAUDE.md template');
    }
}
```

## 6. Helper Commands

### ProfileListCommand
```javascript
async function profileListCommand() {
    const profiles = await ProfileLoader.listAvailable();
    
    console.log('Available profiles:\n');
    profiles.forEach(profile => {
        console.log(`- ${profile.name}: ${profile.description || 'No description'}`);
    });
}
```

### ProfileValidateCommand
```javascript
async function profileValidateCommand(profilePath) {
    const validator = new ProfileValidator();
    
    try {
        const profile = await fs.readJson(profilePath);
        const errors = validator.validate(profile);
        
        if (errors.length === 0) {
            console.log('✓ Profile is valid');
        } else {
            console.log('✗ Profile validation errors:');
            errors.forEach(error => console.log(`  - ${error}`));
        }
    } catch (error) {
        console.error('Failed to load profile:', error.message);
    }
}
```

### ClearCacheCommand
```javascript
async function clearCacheCommand() {
    const cacheDir = path.join(os.homedir(), '.copytree', 'cache');
    
    try {
        await fs.emptyDir(cacheDir);
        console.log('✓ Cache cleared successfully');
    } catch (error) {
        console.error('Failed to clear cache:', error.message);
    }
}
```

## Implementation Priority

1. **Phase 1 - Core Functionality**
   - Basic CopyCommand (without AI/Git features)
   - ProfileListCommand
   - Basic output handling

2. **Phase 2 - Enhanced Features**
   - Git integration for CopyCommand
   - Profile auto-detection
   - File transformations

3. **Phase 3 - AI Features**
   - AI filtering for CopyCommand
   - AskCommand
   - AI filename generation

4. **Phase 4 - Advanced Features**
   - WatchCommand
   - InstallClaudeCommand
   - External source integration
   - MCP support

## Testing Strategy

Each command should have:
1. Unit tests for core logic
2. Integration tests with mock file systems
3. E2E tests using child_process to test CLI
4. Performance benchmarks for large projects

## Error Handling

All commands should:
1. Validate inputs early
2. Provide clear error messages
3. Clean up resources on failure
4. Support --dry-run where applicable
5. Handle interruption signals gracefully