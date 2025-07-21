# Dependency Mapping Guide: PHP to Node.js

## Overview

This document provides a comprehensive mapping of PHP dependencies to their Node.js equivalents, including implementation notes, API differences, and migration strategies.

## Core Framework Dependencies

### Laravel Zero Framework → Commander.js

**PHP:**
```php
"laravel-zero/framework": "^12.0"
```

**Node.js:**
```json
"commander": "^14.0.0"
```

**Migration Notes:**
- Laravel Zero provides full application framework; Commander only handles CLI parsing
- Need additional libraries for:
  - Configuration management
  - Service container/DI
  - Event system
  - Logging

**Implementation Example:**
```javascript
// PHP: app/Commands/CopyTreeCommand.php
protected $signature = 'copy {path?} {--ai-filter=}';

// Node.js equivalent
program.command('copy [path]')
  .option('--ai-filter <query>', 'AI filter query')
  .action(handler);
```

## File System and Discovery

### Symfony Finder → Multiple Libraries

**PHP:**
```php
"symfony/finder": "^7.1"
```

**Node.js:**
```json
"glob": "^10.3.10",
"fast-glob": "^3.3.2",
"ignore": "^5.3.0",
"micromatch": "^4.0.5"
```

**Key Differences:**
- Symfony Finder provides fluent interface
- Node.js requires combining multiple libraries

**Implementation Pattern:**
```javascript
// PHP
$finder = new Finder();
$finder->files()
    ->in($directory)
    ->name('*.php')
    ->notName('*Test.php')
    ->exclude('vendor');

// Node.js equivalent
const fg = require('fast-glob');
const ignore = require('ignore');

const files = await fg(['**/*.js', '!**/*Test.js'], {
    cwd: directory,
    ignore: ['**/node_modules/**'],
    dot: true
});
```

## Git Integration

### czproject/git-php → simple-git

**PHP:**
```php
"czproject/git-php": "^4.3"
```

**Node.js:**
```json
"simple-git": "^3.28.0"
```

**API Comparison:**
```javascript
// PHP
$git = new GitRepository($path);
$status = $git->getStatus();
$modified = $git->execute(['diff', '--name-only']);

// Node.js
const git = simpleGit(path);
const status = await git.status();
const modified = await git.diff(['--name-only']);
```

## AI/LLM Integration

### Multiple PHP Libraries → Direct API Clients

**PHP:**
```php
"openai-php/client": "^0.10.3",
"prism-php/prism": "^0.68.0"
```

**Node.js:**
```json
"openai": "^4.91.0",
"@google/generative-ai": "^0.24.1",
"@anthropic-ai/sdk": "^0.35.0"
```

**Implementation Strategy:**
- Create unified AI service interface
- Implement provider-specific adapters
- Handle streaming responses consistently

```javascript
// Unified interface
class AIProvider {
    async generateCompletion(prompt, options) {
        throw new Error('Must implement generateCompletion');
    }
    
    async streamCompletion(prompt, options) {
        throw new Error('Must implement streamCompletion');
    }
}

// Provider implementations
class OpenAIProvider extends AIProvider {
    // Implementation
}

class GeminiProvider extends AIProvider {
    // Implementation
}
```

## Document Processing

### PDF Processing

**PHP:**
```php
"spatie/pdf-to-text": "^1.54"
```

**Node.js:**
```json
"pdf-parse": "^1.1.1",
"pdfjs-dist": "^4.9.0"
```

**Note:** PHP version uses system `pdftotext`; Node.js uses pure JS implementation

### Markdown Processing

**PHP:**
```php
"league/commonmark": "^2.6"
```

**Node.js:**
```json
"marked": "^17.0.0",
"markdown-it": "^14.1.0"
```

## Configuration and Environment

### Laravel Config → Custom Solution

**PHP:**
```php
// Built into Laravel Zero
config('copytree.excluded_dirs')
```

**Node.js:**
```json
"dotenv": "^16.5.0",
"convict": "^6.2.4",
"cosmiconfig": "^9.0.0"
```

**Implementation:**
```javascript
// config.js
const convict = require('convict');

const config = convict({
    excludedDirs: {
        doc: 'Directories to exclude',
        format: Array,
        default: ['node_modules', '.git'],
        env: 'EXCLUDED_DIRS'
    }
});

config.loadFile('./config/default.json');
config.validate({ allowed: 'strict' });

module.exports = config;
```

## YAML Processing

**PHP:**
```php
"symfony/yaml": "^7.2"
```

**Node.js:**
```json
"js-yaml": "^4.1.0"
```

**API is nearly identical:**
```javascript
// PHP
$data = Yaml::parse(file_get_contents('profile.yaml'));

// Node.js
const yaml = require('js-yaml');
const data = yaml.load(fs.readFileSync('profile.yaml', 'utf8'));
```

## Process Management

**PHP:**
```php
"symfony/process": "^7.0"
```

**Node.js:**
```json
"execa": "^9.6.0"
```

**Benefits of execa over child_process:**
- Better error handling
- Promise-based API
- Improved Windows support

## Logging

**PHP:**
```php
// Laravel's built-in logging
Log::info('Processing file', ['path' => $path]);
```

**Node.js:**
```json
"winston": "^3.19.0",
"pino": "^9.6.0"
```

**Winston Implementation:**
```javascript
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});
```

## CLI Enhancement

**PHP:**
```php
// Built into Laravel Zero
$this->info('Success!');
$this->table($headers, $rows);
$progressBar = $this->output->createProgressBar();
```

**Node.js:**
```json
"chalk": "^5.3.0",
"ora": "^8.2.0",
"cli-table3": "^0.6.5",
"inquirer": "^13.5.0",
"cli-progress": "^3.12.0"
```

## Testing

**PHP:**
```php
"phpunit/phpunit": "^11.5",
"pestphp/pest": "^3.7",
"mockery/mockery": "^1.6"
```

**Node.js:**
```json
"jest": "^30.0.4",
"@jest/globals": "^30.0.4",
"supertest": "^7.0.0"
```

## Development Tools

**PHP:**
```php
"phpstan/phpstan": "^2.0",
"laravel/pint": "^1.19"
```

**Node.js:**
```json
"@types/node": "^22.12.0",
"typescript": "^5.7.0",
"eslint": "^9.18.0",
"prettier": "^3.5.0"
```

## Additional Node.js-Specific Dependencies

These have no direct PHP equivalent but are useful:

```json
{
  "fs-extra": "^11.2.0",     // Enhanced fs operations
  "p-limit": "^6.1.0",        // Concurrency control
  "node-cache": "^5.1.2",     // Simple caching
  "debug": "^4.4.0",          // Debug logging
  "yargs": "^17.7.2",         // Alternative to commander
  "zod": "^3.24.0"           // Runtime validation
}
```

## Migration Priority

1. **Essential (Day 1):**
   - commander
   - dotenv
   - fs-extra
   - glob/fast-glob
   - simple-git

2. **Core Features (Week 1):**
   - @google/generative-ai
   - marked
   - js-yaml
   - chalk
   - ora

3. **Advanced Features (Week 2):**
   - pdf-parse
   - winston/pino
   - inquirer
   - execa

4. **Polish (Week 3):**
   - cli-progress
   - cli-table3
   - node-cache
   - debug

## Performance Considerations

- **File Discovery**: `fast-glob` is significantly faster than `glob`
- **Process Spawning**: `execa` has overhead; batch operations when possible
- **AI Calls**: Implement request queuing and rate limiting
- **Large Files**: Use streams instead of loading into memory

## Security Notes

1. **Environment Variables**: Use `dotenv` with `.env.example`
2. **File Paths**: Sanitize all user input paths
3. **Process Execution**: Never pass unsanitized input to `execa`
4. **API Keys**: Store securely, never commit to repo

## Recommendations

1. Start with minimal dependencies
2. Add libraries as features are implemented
3. Prefer well-maintained, popular packages
4. Check for security vulnerabilities regularly
5. Use exact versions in package.json for consistency