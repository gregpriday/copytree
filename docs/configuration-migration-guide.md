# Configuration Migration Guide

## Overview

Laravel Zero provides a robust configuration system with environment variable support, config caching, and hierarchical merging. This guide outlines how to implement equivalent functionality in Node.js while maintaining compatibility and ease of use.

## Laravel Configuration System

### PHP Configuration Structure
```
config/
├── app.php          # Application metadata
├── copytree.php     # Main copytree config
├── ai.php           # AI provider settings
├── cache.php        # Cache configuration
├── database.php     # Database settings
└── logging.php      # Logging configuration
```

### Laravel Config Access
```php
// Access configuration
$excludedDirs = config('copytree.excluded_directories');
$aiProvider = config('ai.default_provider', 'gemini');

// Runtime config changes
config(['ai.provider' => 'openai']);
```

## Node.js Configuration Architecture

### 1. Configuration Manager

```javascript
// src/config/ConfigManager.js
const fs = require('fs-extra');
const path = require('path');
const { merge } = require('lodash');
const dotenv = require('dotenv');

class ConfigManager {
    constructor() {
        this.config = {};
        this.envLoaded = false;
        this.configPath = path.join(__dirname, '../../config');
        this.userConfigPath = path.join(os.homedir(), '.copytree');
    }
    
    async initialize() {
        // 1. Load environment variables
        this.loadEnv();
        
        // 2. Load default configuration
        await this.loadDefaultConfig();
        
        // 3. Load user configuration
        await this.loadUserConfig();
        
        // 4. Apply environment overrides
        this.applyEnvOverrides();
        
        // 5. Validate configuration
        this.validate();
    }
    
    loadEnv() {
        if (!this.envLoaded) {
            // Load .env from project root
            dotenv.config();
            
            // Load user .env if exists
            const userEnvPath = path.join(this.userConfigPath, '.env');
            if (fs.existsSync(userEnvPath)) {
                dotenv.config({ path: userEnvPath });
            }
            
            this.envLoaded = true;
        }
    }
    
    async loadDefaultConfig() {
        const configFiles = await fs.readdir(this.configPath);
        
        for (const file of configFiles) {
            if (file.endsWith('.js')) {
                const name = path.basename(file, '.js');
                const config = require(path.join(this.configPath, file));
                this.config[name] = config;
            }
        }
    }
    
    async loadUserConfig() {
        const userConfigFile = path.join(this.userConfigPath, 'config.json');
        
        if (await fs.pathExists(userConfigFile)) {
            const userConfig = await fs.readJson(userConfigFile);
            this.config = merge(this.config, userConfig);
        }
    }
    
    applyEnvOverrides() {
        // Map environment variables to config paths
        const envMappings = {
            'COPYTREE_AI_PROVIDER': 'ai.defaultProvider',
            'COPYTREE_AI_MODEL': 'ai.defaultModel',
            'COPYTREE_CACHE_ENABLED': 'cache.enabled',
            'COPYTREE_LOG_LEVEL': 'logging.level'
        };
        
        for (const [envKey, configPath] of Object.entries(envMappings)) {
            if (process.env[envKey]) {
                this.set(configPath, process.env[envKey]);
            }
        }
    }
    
    get(path, defaultValue = undefined) {
        const keys = path.split('.');
        let value = this.config;
        
        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return defaultValue;
            }
        }
        
        return value;
    }
    
    set(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        let target = this.config;
        
        for (const key of keys) {
            if (!(key in target) || typeof target[key] !== 'object') {
                target[key] = {};
            }
            target = target[key];
        }
        
        target[lastKey] = value;
    }
    
    validate() {
        // Validate required configurations
        const required = [
            'ai.providers.gemini.apiKey',
            'copytree.version'
        ];
        
        for (const path of required) {
            if (!this.get(path)) {
                console.warn(`Missing required configuration: ${path}`);
            }
        }
    }
    
    toJSON() {
        return JSON.stringify(this.config, null, 2);
    }
}

// Singleton instance
let instance;
module.exports = {
    getConfig: async () => {
        if (!instance) {
            instance = new ConfigManager();
            await instance.initialize();
        }
        return instance;
    },
    config: (path, defaultValue) => {
        if (!instance) {
            throw new Error('Configuration not initialized');
        }
        return instance.get(path, defaultValue);
    }
};
```

### 2. Configuration Files

#### Main Application Config
```javascript
// config/app.js
module.exports = {
    name: 'Copytree',
    version: require('../package.json').version,
    environment: process.env.NODE_ENV || 'production',
    debug: process.env.DEBUG === 'true',
    
    // CLI settings
    cli: {
        defaultCommand: 'copy',
        colors: true,
        progressBars: true
    }
};
```

#### CopyTree Core Config
```javascript
// config/copytree.js
module.exports = {
    // Global excluded directories
    excludedDirectories: {
        global: [
            'node_modules',
            '.git',
            '.svn',
            '.hg',
            '.idea',
            '.vscode',
            '__pycache__',
            '.pytest_cache',
            '.mypy_cache',
            'venv',
            'vendor',
            'dist',
            'build',
            'target',
            '.next',
            '.nuxt',
            '.cache',
            'coverage',
            '.nyc_output',
            '.eggs',
            '*.egg-info'
        ],
        basePath: [
            'vendor',
            'Pods',
            '.github',
            'bootstrap/cache',
            'storage',
            'node_modules',
            'public',
            '.git'
        ]
    },
    
    // Global excluded files
    excludedFiles: [
        '*.log',
        '*.lock',
        '*.cache',
        '*.tmp',
        '*.temp',
        '.DS_Store',
        'Thumbs.db',
        '*.pyc',
        '*.pyo',
        '*.swp',
        '*.swo',
        '*.map',
        '*.min.js',
        '*.min.css',
        'package-lock.json',
        'yarn.lock',
        'composer.lock',
        'Gemfile.lock',
        'poetry.lock',
        'Cargo.lock'
    ],
    
    // Default limits
    limits: {
        characterLimit: 3000000,
        fileLimit: 1000,
        maxFileSize: 10 * 1024 * 1024, // 10MB
        maxProjectSize: 100 * 1024 * 1024 // 100MB
    },
    
    // Output settings
    output: {
        defaultFormat: 'xml',
        includeLineNumbers: false,
        includeGitStatus: true,
        showSize: true
    },
    
    // Profile settings
    profiles: {
        defaultProfile: 'default',
        autoDetect: true,
        searchPaths: [
            './.ctree',
            './profiles',
            '~/.copytree/profiles',
            __dirname + '/../profiles'
        ]
    }
};
```

#### AI Configuration
```javascript
// config/ai.js
module.exports = {
    defaultProvider: process.env.AI_DEFAULT_PROVIDER || 'gemini',
    defaultModel: process.env.AI_DEFAULT_MODEL || null,
    
    providers: {
        openai: {
            apiKey: process.env.OPENAI_API_KEY,
            baseURL: process.env.OPENAI_BASE_URL,
            organization: process.env.OPENAI_ORG_ID,
            models: {
                default: 'gpt-3.5-turbo',
                fast: 'gpt-3.5-turbo',
                quality: 'gpt-4',
                vision: 'gpt-4-vision-preview'
            }
        },
        
        gemini: {
            apiKey: process.env.GEMINI_API_KEY,
            models: {
                default: 'gemini-1.5-flash',
                fast: 'gemini-1.5-flash',
                quality: 'gemini-1.5-pro'
            },
            safetySettings: {
                harmBlockThreshold: 'BLOCK_ONLY_HIGH'
            }
        },
        
        anthropic: {
            apiKey: process.env.ANTHROPIC_API_KEY,
            models: {
                default: 'claude-3-haiku-20240307',
                fast: 'claude-3-haiku-20240307',
                quality: 'claude-3-opus-20240229'
            }
        }
    },
    
    // Token limits and costs
    tokens: {
        maxPromptTokens: 100000,
        maxCompletionTokens: 4096,
        warningThreshold: 50000
    },
    
    // Rate limiting
    rateLimit: {
        enabled: true,
        requestsPerMinute: 60,
        tokensPerMinute: 90000
    },
    
    // Caching
    cache: {
        enabled: true,
        ttl: 3600, // 1 hour
        maxSize: 100 // MB
    }
};
```

#### Cache Configuration
```javascript
// config/cache.js
module.exports = {
    default: process.env.CACHE_DRIVER || 'file',
    
    stores: {
        file: {
            driver: 'file',
            path: process.env.CACHE_PATH || '~/.copytree/cache'
        },
        
        memory: {
            driver: 'memory',
            max: 100, // Maximum number of items
            ttl: 600  // 10 minutes
        },
        
        redis: {
            driver: 'redis',
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379,
            database: process.env.REDIS_DB || 0,
            prefix: 'copytree_cache'
        }
    },
    
    prefix: process.env.CACHE_PREFIX || 'copytree_cache'
};
```

#### Logging Configuration
```javascript
// config/logging.js
module.exports = {
    default: process.env.LOG_CHANNEL || 'file',
    
    channels: {
        file: {
            driver: 'file',
            path: process.env.LOG_PATH || '~/.copytree/logs/copytree.log',
            level: process.env.LOG_LEVEL || 'info',
            maxFiles: 7,
            maxSize: '10m'
        },
        
        console: {
            driver: 'console',
            level: process.env.LOG_LEVEL || 'info',
            colorize: true
        },
        
        daily: {
            driver: 'daily',
            path: process.env.LOG_PATH || '~/.copytree/logs',
            level: process.env.LOG_LEVEL || 'info',
            days: 14
        }
    }
};
```

### 3. Environment Variables

#### .env.example
```bash
# AI Provider Configuration
AI_DEFAULT_PROVIDER=gemini
OPENAI_API_KEY=
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
FIREWORKS_API_KEY=

# Model Selection
OPENAI_MODEL=gpt-3.5-turbo
GEMINI_MODEL=gemini-1.5-flash
ANTHROPIC_MODEL=claude-3-haiku-20240307

# Cache Configuration
CACHE_DRIVER=file
CACHE_PATH=~/.copytree/cache
CACHE_PREFIX=copytree_

# Logging
LOG_CHANNEL=file
LOG_LEVEL=info
LOG_PATH=~/.copytree/logs

# Application
NODE_ENV=production
DEBUG=false

# Feature Flags
FEATURE_MCP_ENABLED=false
FEATURE_WATCH_MODE=true
FEATURE_AI_PROFILES=false

# Limits
MAX_FILE_SIZE=10485760
MAX_PROJECT_SIZE=104857600
CHARACTER_LIMIT=3000000
```

### 4. User Configuration

#### User Config Directory Structure
```
~/.copytree/
├── config.json          # User overrides
├── .env                 # User environment vars
├── profiles/            # Custom profiles
├── transformers/        # Custom transformers
├── cache/              # Cache storage
├── logs/               # Log files
└── state/              # Conversation states
```

#### User Config Example
```json
{
  "ai": {
    "defaultProvider": "openai",
    "providers": {
      "openai": {
        "models": {
          "default": "gpt-4"
        }
      }
    }
  },
  "copytree": {
    "excludedDirectories": {
      "global": [
        "my-custom-ignore"
      ]
    },
    "output": {
      "includeLineNumbers": true
    }
  },
  "profiles": {
    "defaultProfile": "my-custom-profile"
  }
}
```

### 5. Configuration Validation

```javascript
// src/config/ConfigValidator.js
const Joi = require('joi');

class ConfigValidator {
    constructor() {
        this.schemas = {
            ai: this.createAISchema(),
            copytree: this.createCopytreeSchema(),
            cache: this.createCacheSchema()
        };
    }
    
    createAISchema() {
        return Joi.object({
            defaultProvider: Joi.string()
                .valid('openai', 'gemini', 'anthropic', 'fireworks')
                .required(),
            providers: Joi.object().pattern(
                Joi.string(),
                Joi.object({
                    apiKey: Joi.string().required(),
                    models: Joi.object()
                })
            )
        });
    }
    
    createCopytreeSchema() {
        return Joi.object({
            excludedDirectories: Joi.object({
                global: Joi.array().items(Joi.string()),
                basePath: Joi.array().items(Joi.string())
            }),
            limits: Joi.object({
                characterLimit: Joi.number().positive(),
                fileLimit: Joi.number().positive(),
                maxFileSize: Joi.number().positive()
            })
        });
    }
    
    validate(config) {
        const errors = [];
        
        for (const [key, schema] of Object.entries(this.schemas)) {
            if (config[key]) {
                const result = schema.validate(config[key]);
                if (result.error) {
                    errors.push({
                        section: key,
                        errors: result.error.details
                    });
                }
            }
        }
        
        return errors;
    }
}
```

### 6. Configuration Helpers

```javascript
// src/config/helpers.js

// Helper function similar to Laravel's config()
function config(path, defaultValue) {
    const { config } = require('./ConfigManager');
    return config(path, defaultValue);
}

// Helper to check feature flags
function feature(flag) {
    return config(`features.${flag}`, false);
}

// Helper to get all config for a section
function configSection(section) {
    return config(section, {});
}

// Export helpers
module.exports = {
    config,
    feature,
    configSection
};
```

### 7. Dynamic Configuration

```javascript
// src/config/DynamicConfig.js
class DynamicConfig {
    constructor(configManager) {
        this.configManager = configManager;
        this.overrides = new Map();
    }
    
    // Temporarily override config values
    override(path, value) {
        this.overrides.set(path, {
            original: this.configManager.get(path),
            override: value
        });
        this.configManager.set(path, value);
    }
    
    // Restore original values
    restore(path) {
        if (this.overrides.has(path)) {
            const { original } = this.overrides.get(path);
            this.configManager.set(path, original);
            this.overrides.delete(path);
        }
    }
    
    // Restore all overrides
    restoreAll() {
        for (const [path, { original }] of this.overrides) {
            this.configManager.set(path, original);
        }
        this.overrides.clear();
    }
    
    // Scoped override for async operations
    async withOverride(overrides, callback) {
        const paths = Object.keys(overrides);
        
        // Apply overrides
        for (const [path, value] of Object.entries(overrides)) {
            this.override(path, value);
        }
        
        try {
            return await callback();
        } finally {
            // Restore all
            for (const path of paths) {
                this.restore(path);
            }
        }
    }
}
```

## Migration Strategy

### 1. Initial Setup
```javascript
// bin/copytree.js
const { getConfig } = require('../src/config/ConfigManager');

async function main() {
    // Initialize configuration
    const config = await getConfig();
    
    // Configuration is now available globally
    const program = createProgram(config);
    program.parse(process.argv);
}

main().catch(console.error);
```

### 2. Command Usage
```javascript
// src/commands/copy.js
const { config } = require('../config/helpers');

async function copyCommand(path, options) {
    const excludedDirs = config('copytree.excludedDirectories.global', []);
    const charLimit = options.charLimit || config('copytree.limits.characterLimit');
    
    // Use configuration values
}
```

### 3. Testing Configuration
```javascript
// tests/config/ConfigManager.test.js
describe('ConfigManager', () => {
    let configManager;
    
    beforeEach(() => {
        // Mock environment
        process.env.AI_DEFAULT_PROVIDER = 'openai';
        
        configManager = new ConfigManager();
    });
    
    it('should load default configuration', async () => {
        await configManager.initialize();
        
        expect(configManager.get('app.name')).toBe('Copytree');
        expect(configManager.get('ai.defaultProvider')).toBe('openai');
    });
    
    it('should merge user configuration', async () => {
        // Mock user config file
        mockFs({
            '/home/user/.copytree/config.json': JSON.stringify({
                copytree: {
                    limits: {
                        characterLimit: 5000000
                    }
                }
            })
        });
        
        await configManager.initialize();
        
        expect(configManager.get('copytree.limits.characterLimit'))
            .toBe(5000000);
    });
});
```

## Best Practices

1. **Environment Variables**: Always prefix with `COPYTREE_` to avoid conflicts
2. **Defaults**: Provide sensible defaults for all configuration values
3. **Validation**: Validate configuration on startup
4. **Documentation**: Document all configuration options in README
5. **Type Safety**: Consider using TypeScript for better type checking
6. **Security**: Never log sensitive configuration values (API keys)
7. **Performance**: Cache configuration lookups for frequently accessed values

## Migration Checklist

- [ ] Implement ConfigManager class
- [ ] Create all configuration files
- [ ] Set up environment variable loading
- [ ] Implement user configuration support
- [ ] Add configuration validation
- [ ] Create helper functions
- [ ] Add dynamic configuration support
- [ ] Write comprehensive tests
- [ ] Document all configuration options
- [ ] Add migration script for existing users