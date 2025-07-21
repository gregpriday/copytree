# Copytree Node.js Implementation Guide

This document provides a detailed implementation guide for completing the Node.js rewrite of copytree. It's designed to be used by the Node.js project to achieve feature parity with the PHP version.

**Important**: This is an internal tool rewrite. All AI features will use Gemini exclusively.

## Executive Summary

The Node.js rewrite has implemented core functionality but needs significant work to reach feature parity:

- **Commands**: Only 3 of 12 commands implemented (25%)
- **Pipeline Stages**: Missing 6 critical stages  
- **Transformers**: 7 of 13 implemented (54%)
- **Features**: Missing external sources, advanced filtering, and several key capabilities

## Part 1: Missing CLI Commands Implementation Guide

### 1. Watch Command (`watch`)

**PHP Reference**: `/app/Commands/WatchCommand.php`

**Purpose**: Watch directory for changes and regenerate output automatically.

**Implementation Steps**:

1. Create `/src/commands/WatchCommand.js` with the following structure:

```javascript
// Key dependencies needed
const chokidar = require('chokidar'); // For file watching
const debounce = require('lodash.debounce'); // For debouncing
const { Pipeline } = require('../pipeline/Pipeline');
const { ProfileLoader } = require('../profiles/ProfileLoader');

class WatchCommand {
  constructor() {
    this.lastState = new Map(); // Track file mtimes
    this.outputPath = null;
  }

  async execute(path, options) {
    // 1. Resolve path (handle GitHub URLs using GitHubUrlHandler)
    // 2. Determine output file (use --output or generate via AI)
    // 3. Run initial generation
    // 4. Set up file watcher with profile/gitignore filtering
    // 5. Debounce regeneration on changes
  }
}
```

**Key Features to Implement**:
- GitHub URL support (see External Sources section)
- Profile-aware file watching (only watch relevant files)
- Gitignore filtering in watcher
- Debounced regeneration (default 500ms)
- macOS Finder reveal functionality

**Critical Code from PHP** (lines 269-333):
```php
private function getDirectoryState(
    string $path,
    ?GitIgnoreManager $gitIgnoreManager = null,
    ?RulesetFilter $filter = null
): array {
    // Track file modification times
    // Apply gitignore and profile filters
    // Return sorted state map
}
```

### 2. Profile Commands

#### 2.1 `profile:create` Command

**PHP Reference**: `/app/Commands/CreateProfileCommand.php`

**Purpose**: AI-powered profile creation based on project analysis.

**Implementation Steps**:

1. Create `/src/commands/ProfileCreateCommand.js`:

```javascript
class ProfileCreateCommand {
  async execute(path, options) {
    // 1. Analyze project structure
    // 2. Detect frameworks/languages
    // 3. Use Gemini to suggest profile rules
    // 4. Interactive refinement
    // 5. Save profile to .ctree/
  }
}
```

**Gemini Integration Required**:
- Send project file list and sample content to Gemini
- Use prompt: "Generate a copytree profile YAML for this project..."
- Character limit option (default 1500)

#### 2.2 `profile:list` Command

**PHP Reference**: `/app/Commands/ProfileListCommand.php`

**Simple Implementation**:
```javascript
class ProfileListCommand {
  async execute() {
    // 1. Search all profile paths
    // 2. Load and display each profile name + description
    // 3. Show source location (built-in/user/project)
  }
}
```

#### 2.3 `profile:validate` Command

**PHP Reference**: `/app/Commands/ProfileValidateCommand.php`

**Implementation**:
```javascript
class ProfileValidateCommand {
  async execute(profileName) {
    // 1. Load profile using ProfileLoader
    // 2. Run Joi validation
    // 3. Check for common issues (invalid patterns, etc.)
    // 4. Display validation results
  }
}
```

### 3. Documentation Command (`copy:docs`)

**PHP Reference**: `/app/Commands/CopyDocsCommand.php`

**Purpose**: Copy framework/library documentation.

**Implementation Steps**:

1. Create documentation directory structure:
```
/docs/
  ├── frameworks/
  │   ├── laravel.md
  │   ├── sveltekit.md
  │   └── nextjs.md
  └── topics/
      ├── profiles.md
      └── transformers.md
```

2. Implement command:
```javascript
class CopyDocsCommand {
  async execute(options) {
    // 1. List available topics if no --topic
    // 2. Load requested documentation
    // 3. Output to file/clipboard/display
  }
}
```

### 4. Configuration Validation (`config:validate`)

**PHP Reference**: `/app/Commands/ConfigValidateCommand.php`

**Implementation**:
```javascript
class ConfigValidateCommand {
  async execute(section) {
    // 1. Load configuration
    // 2. Validate against schema
    // 3. Check AI credentials if validating 'ai' section
    // 4. Display validation results
  }
}
```

### 5. Installation Commands

#### 5.1 `install:copytree`

**PHP Reference**: `/app/Commands/InstallCopytreeCommand.php`

**Setup Tasks**:
1. Create `~/.copytree/` directories
2. Copy default configuration
3. Set up environment file
4. Check dependencies (Git, etc.)

#### 5.2 `install:claude`

**PHP Reference**: `/app/Commands/InstallClaudeCommand.php`

**Implementation**:
1. Generate/update `CLAUDE.md` file
2. Include project-specific instructions
3. Option to append to existing file

### 6. MCP Server Command (`mcp`)

**PHP Reference**: `/app/Commands/McpCommand.php`

**Purpose**: Model Context Protocol server for Claude integration.

**Implementation Guide**:
```javascript
class McpCommand {
  async execute(directory, options) {
    // 1. Set up MCP server on specified port
    // 2. Implement required MCP endpoints
    // 3. Handle file operations via MCP protocol
  }
}
```

**MCP Protocol Requirements**:
- List files endpoint
- Read file endpoint
- Search files endpoint
- Get file tree endpoint

## Part 2: Missing Pipeline Stages

### 1. ExternalSourceStage

**PHP Reference**: `/app/Pipeline/Stages/ExternalSourceStage.php`

**Purpose**: Include files from GitHub repositories or local directories.

**Implementation Steps**:

1. Create `/src/pipeline/stages/ExternalSourceStage.js`:

```javascript
class ExternalSourceStage extends Stage {
  constructor(externalItems) {
    super();
    this.externalItems = externalItems; // Array of {source, destination, rules}
  }

  async process(input) {
    const { files } = input;
    const externalFiles = [];

    for (const item of this.externalItems) {
      // 1. Validate source and destination
      // 2. Use GitHubUrlHandler for GitHub URLs
      // 3. Load files using FileLoader equivalent
      // 4. Apply rules if provided
      // 5. Remap paths with destination prefix
    }

    // Merge external files with input files
    return { ...input, files: [...files, ...externalFiles] };
  }
}
```

**GitHubUrlHandler Implementation** (see Part 5 for details):
- Parse GitHub URLs
- Clone/update repositories
- Cache in `~/.copytree/external-sources/`

### 2. DeduplicateFilesStage

**PHP Reference**: `/app/Pipeline/Stages/DeduplicateFilesStage.php`

**Purpose**: Remove duplicate files based on content hash.

**Implementation**:
```javascript
const crypto = require('crypto');

class DeduplicateFilesStage extends Stage {
  async process(input) {
    const { files } = input;
    const contentHashes = new Map();
    const uniqueFiles = [];

    for (const file of files) {
      const hash = crypto.createHash('md5').update(file.content).digest('hex');
      if (!contentHashes.has(hash)) {
        contentHashes.set(hash, true);
        uniqueFiles.push(file);
      }
    }

    return { ...input, files: uniqueFiles };
  }
}
```

### 3. SortFilesStage

**PHP Reference**: `/app/Pipeline/Stages/SortFilesStage.php`

**Purpose**: Sort files by various criteria.

**Implementation**:
```javascript
class SortFilesStage extends Stage {
  constructor(sortBy = 'path') {
    super();
    this.sortBy = sortBy; // 'path', 'size', 'modified', 'name'
  }

  async process(input) {
    const { files } = input;
    const sorted = [...files].sort((a, b) => {
      switch (this.sortBy) {
        case 'size':
          return b.stats.size - a.stats.size;
        case 'modified':
          return b.stats.mtime - a.stats.mtime;
        case 'name':
          return a.name.localeCompare(b.name);
        default:
          return a.relativePath.localeCompare(b.relativePath);
      }
    });

    return { ...input, files: sorted };
  }
}
```

### 4. AlwaysIncludeStage

**PHP Reference**: `/app/Pipeline/Stages/AlwaysIncludeStage.php`

**Purpose**: Force include specific files regardless of other filters.

**Implementation**:
```javascript
class AlwaysIncludeStage extends Stage {
  constructor(alwaysPatterns) {
    super();
    this.alwaysPatterns = alwaysPatterns; // Array of glob patterns
  }

  async process(input) {
    // This stage needs to be integrated with ProfileFilterStage
    // to ensure always patterns override exclude rules
  }
}
```

### 5. ComposerStage

**PHP Reference**: `/app/Pipeline/Stages/ComposerStage.php`

**Purpose**: Include PHP package instruction files.

**Implementation**:
```javascript
class ComposerStage extends Stage {
  async process(input) {
    const { files } = input;
    const composerJson = files.find(f => f.name === 'composer.json');
    
    if (!composerJson) return input;

    // 1. Parse composer.json
    // 2. Look for vendor/*/.copytree files
    // 3. Add instruction files to output
  }
}
```

### 6. NPMStage

**PHP Reference**: `/app/Pipeline/Stages/NPMStage.php`

**Purpose**: Include NPM package instruction files.

**Implementation**: Similar to ComposerStage but for `node_modules/*/.copytree` files.

## Part 3: Missing Transformers

### 1. Image Transformers with Gemini

#### 1.1 ImageDescription Transformer

**PHP Reference**: `/app/Transforms/Transformers/Images/ImageDescription.php`

**Implementation**:
```javascript
const { GoogleGenerativeAI } = require('@google/generative-ai');

class ImageDescriptionTransformer extends BaseTransformer {
  async transform(file, content) {
    // Convert image to base64
    const base64 = content.toString('base64');
    
    // Use Gemini Vision API
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });
    
    const result = await model.generateContent([
      "Describe this image in detail for a developer:",
      { inlineData: { mimeType: file.mimeType, data: base64 } }
    ]);
    
    return result.response.text();
  }
}
```

#### 1.2 SvgDescription Transformer

**PHP Reference**: `/app/Transforms/Transformers/Images/SvgDescription.php`

**Implementation**: Similar to ImageDescription but optimized for SVG analysis.

### 2. Document Converters

#### 2.1 DocumentToText Transformer

**PHP Reference**: `/app/Transforms/Transformers/Converters/DocumentToText.php`

**Dependencies**: Requires Pandoc installation.

**Implementation**:
```javascript
const { execSync } = require('child_process');

class DocumentToTextTransformer extends BaseTransformer {
  supports(file) {
    return ['.docx', '.odt', '.rtf'].includes(file.extension);
  }

  async transform(file, content) {
    // Save to temp file
    const tempPath = await this.saveToTemp(content);
    
    try {
      // Use pandoc to convert
      const text = execSync(`pandoc -f auto -t plain "${tempPath}"`, {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024
      });
      
      return text;
    } finally {
      // Clean up temp file
      fs.unlinkSync(tempPath);
    }
  }
}
```

### 3. Text Processing Transformers

#### 3.1 FirstLinesTransformer

**PHP Reference**: `/app/Transforms/Transformers/Generic/FirstLinesTransformer.php`

**Implementation**:
```javascript
class FirstLinesTransformer extends BaseTransformer {
  constructor(lineCount = 20) {
    super();
    this.lineCount = lineCount;
  }

  async transform(file, content) {
    const lines = content.toString().split('\n');
    return lines.slice(0, this.lineCount).join('\n');
  }
}
```

#### 3.2 HTMLStripper

**PHP Reference**: `/app/Transforms/Transformers/HTML/HTMLStripper.php`

**Implementation**:
```javascript
const htmlToText = require('html-to-text');

class HTMLStripperTransformer extends BaseTransformer {
  async transform(file, content) {
    return htmlToText.convert(content.toString(), {
      wordwrap: false,
      preserveNewlines: true
    });
  }
}
```

#### 3.3 MarkdownLinkStripper

**PHP Reference**: `/app/Transforms/Transformers/Markdown/MarkdownLinkStripper.php`

**Implementation**:
```javascript
class MarkdownLinkStripperTransformer extends BaseTransformer {
  async transform(file, content) {
    const text = content.toString();
    // Remove markdown links but keep text
    return text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\[([^\]]+)\]\[[^\]]+\]/g, '$1');
  }
}
```

### 4. AI-Powered Summaries

#### 4.1 FileSummary Transformer

**PHP Reference**: `/app/Transforms/Transformers/Summarizers/FileSummary.php`

**Implementation with Gemini**:
```javascript
class FileSummaryTransformer extends BaseTransformer {
  async transform(file, content) {
    const prompt = `Summarize this ${file.extension} file in 2-3 sentences:
    
${content.toString().slice(0, 4000)}`;

    // Use Gemini for summarization
    const summary = await this.aiService.generate(prompt, 'summarization');
    return summary;
  }
}
```

#### 4.2 UnitTestSummary Transformer

**PHP Reference**: `/app/Transforms/Transformers/Summarizers/UnitTestSummary.php`

**Implementation**: Similar to FileSummary but with test-specific prompts.

## Part 4: Profile System Enhancements

### 1. ProfileGuesser Implementation

**PHP Reference**: `/app/Profiles/ProfileGuesser.php`

**Purpose**: Auto-detect project type and suggest appropriate profile.

**Implementation Guide**:
```javascript
class ProfileGuesser {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.detectors = [
      { check: this.isLaravel.bind(this), profile: 'laravel' },
      { check: this.isSvelteKit.bind(this), profile: 'sveltekit' },
      { check: this.isNextJS.bind(this), profile: 'nextjs' },
      // Add more detectors
    ];
  }

  async guess() {
    for (const detector of this.detectors) {
      if (await detector.check()) {
        return detector.profile;
      }
    }
    return 'default';
  }

  async isLaravel() {
    // Check for artisan, composer.json with laravel/framework
    return fs.existsSync(path.join(this.projectPath, 'artisan')) &&
           this.hasComposerPackage('laravel/framework');
  }

  async isSvelteKit() {
    // Check for svelte.config.js, package.json with @sveltejs/kit
    return fs.existsSync(path.join(this.projectPath, 'svelte.config.js'));
  }
}
```

### 2. Profile Schema Updates

Add to profile validation schema:
```javascript
const profileSchema = Joi.object({
  // ... existing fields ...
  external: Joi.array().items(
    Joi.object({
      source: Joi.string().required(),
      destination: Joi.string().required(),
      rules: Joi.array().items(Joi.string())
    })
  ),
  always: Joi.array().items(Joi.string()),
  transformers: Joi.object().pattern(
    Joi.string(),
    Joi.object({
      enabled: Joi.boolean(),
      options: Joi.object()
    })
  )
});
```

## Part 5: External Sources Implementation

### GitHubUrlHandler

**PHP Reference**: `/app/Services/GitHubUrlHandler.php`

**Complete Implementation Guide**:

```javascript
const { execSync } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs-extra');

class GitHubUrlHandler {
  constructor(url) {
    this.url = url;
    this.parseUrl();
    this.setupCacheDirectory();
  }

  static isGitHubUrl(url) {
    return url.startsWith('https://github.com/');
  }

  parseUrl() {
    const pattern = /^https:\/\/github\.com\/([^\/]+\/[^\/]+)(?:\/tree\/([^\/]+))?(?:\/(.*?))?$/;
    const matches = this.url.match(pattern);
    
    if (!matches) {
      throw new Error('Invalid GitHub URL format');
    }

    this.repoUrl = `https://github.com/${matches[1]}.git`;
    this.branch = matches[2] || '';
    this.subPath = matches[3] || '';
    this.updateCacheKey();
  }

  updateCacheKey() {
    const identifier = this.repoUrl.replace('https://github.com/', '').replace('.git', '');
    this.cacheKey = crypto.createHash('md5')
      .update(`${identifier}/${this.branch || 'default'}`)
      .digest('hex');
  }

  setupCacheDirectory() {
    this.cacheDir = path.join(os.homedir(), '.copytree', 'external-sources');
    fs.ensureDirSync(this.cacheDir);
    this.repoDir = path.join(this.cacheDir, this.cacheKey);
  }

  async getFiles() {
    if (!fs.existsSync(this.repoDir)) {
      await this.cloneRepository();
    } else {
      await this.updateRepository();
    }

    const targetPath = this.subPath 
      ? path.join(this.repoDir, this.subPath)
      : this.repoDir;

    if (!fs.existsSync(targetPath)) {
      throw new Error(`Path '${this.subPath}' not found in repository`);
    }

    return targetPath;
  }

  async cloneRepository() {
    // Detect default branch if needed
    if (!this.branch) {
      this.branch = await this.detectDefaultBranch();
      this.updateCacheKey();
      this.setupCacheDirectory();
    }

    const command = `git clone --branch ${this.branch} --single-branch ${this.repoUrl} ${this.repoDir}`;
    
    try {
      execSync(command, { stdio: 'pipe' });
    } catch (error) {
      // Handle specific errors (auth, not found, etc.)
      throw new Error(`Failed to clone repository: ${error.message}`);
    }
  }

  async updateRepository() {
    try {
      execSync('git fetch', { cwd: this.repoDir });
      
      const behindCount = parseInt(
        execSync(`git rev-list HEAD..origin/${this.branch} --count`, { 
          cwd: this.repoDir,
          encoding: 'utf8'
        }).trim()
      );

      if (behindCount > 0) {
        execSync('git reset --hard HEAD', { cwd: this.repoDir });
        execSync('git clean -fd', { cwd: this.repoDir });
        execSync(`git pull origin ${this.branch}`, { cwd: this.repoDir });
      }
    } catch (error) {
      // Re-clone on failure
      fs.removeSync(this.repoDir);
      await this.cloneRepository();
    }
  }

  async detectDefaultBranch() {
    try {
      const output = execSync(`git ls-remote --symref ${this.repoUrl} HEAD`, {
        encoding: 'utf8'
      });
      
      const match = output.match(/ref: refs\/heads\/([^\s]+)\s+HEAD/);
      return match ? match[1] : 'main';
    } catch {
      return 'main'; // Fallback
    }
  }
}
```

## Part 6: Additional Implementation Notes

### 1. Advanced Filtering

**RulesetFilter Implementation**:

The Node.js version needs advanced rule-based filtering similar to PHP's RulesetFilter:

```javascript
class RulesetFilter {
  constructor(includeRules, excludeRules, alwaysRules) {
    this.includeRules = includeRules;
    this.excludeRules = excludeRules;
    this.alwaysRules = alwaysRules;
  }

  accept(file) {
    // Check always rules first (highest priority)
    if (this.matchesAny(file, this.alwaysRules)) {
      return true;
    }

    // Check exclude rules
    if (this.matchesAny(file, this.excludeRules)) {
      return false;
    }

    // Check include rules
    return this.includeRules.length === 0 || 
           this.matchesAny(file, this.includeRules);
  }

  matchesAny(file, rules) {
    // Implement complex rule matching:
    // - Simple glob patterns
    // - Object rules with operators (=, !=, contains, regex, etc.)
    // - Field-based rules (folder, filename, extension, content)
  }
}
```

### 2. Configuration Updates

Add to Node.js configuration:
```javascript
// config/copytree.js
module.exports = {
  // ... existing config ...
  
  external: {
    cacheDir: '~/.copytree/external-sources',
    cacheTTL: 86400, // 24 hours
    maxCacheSize: '1GB'
  },
  
  transforms: {
    defaults: {
      images: 'description', // Use AI description
      documents: 'text',     // Convert to text
      markdown: 'strip',     // Strip formatting
    }
  },
  
  profiles: {
    searchPaths: [
      '.ctree',
      '~/.copytree/profiles',
      './profiles'
    ]
  }
};
```

### 3. Error Handling Patterns

Follow PHP's error handling approach:
```javascript
class CopytreeError extends Error {
  constructor(message, code = 'UNKNOWN_ERROR') {
    super(message);
    this.code = code;
  }
}

class GitOperationError extends CopytreeError {
  constructor(message) {
    super(message, 'GIT_OPERATION_ERROR');
  }
}

class ProfileNotFoundError extends CopytreeError {
  constructor(profileName) {
    super(`Profile '${profileName}' not found`, 'PROFILE_NOT_FOUND');
  }
}
```

### 4. Testing Requirements

Each new feature should include:
1. Unit tests for individual components
2. Integration tests for pipeline stages
3. E2E tests for commands
4. Mock external dependencies (Git, Gemini API)

### 5. Performance Considerations

1. **Streaming**: Maintain streaming support for large outputs
2. **Caching**: Cache transformed content, AI responses, and external sources
3. **Parallel Processing**: Use pipeline's parallel capabilities where possible
4. **Memory Management**: Process large files in chunks

## Conclusion

This guide provides comprehensive implementation details for achieving feature parity with the PHP version. Focus on:

1. **Priority 1**: External sources and missing commands (especially `watch` and `copy:docs`)
2. **Priority 2**: Missing transformers with Gemini integration
3. **Priority 3**: Advanced filtering and profile enhancements

All features should use Gemini as the exclusive AI provider, simplifying the implementation compared to PHP's multi-provider approach.