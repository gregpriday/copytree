import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { logger } from '../utils/logger.js';
import { CommandError } from '../utils/errors.js';

/**
 * Install copytree command - Set up CopyTree environment and configuration
 * (Now handled by InstallView component)
 */
async function installCopytreeCommand(_options = {}) {
  const startTime = Date.now();
  
  try {
    const steps = [];
    
    // Step 1: Create directories
    const directories = await createDirectories();
    steps.push({
      name: 'Create directories',
      status: 'success',
      details: `Created ${directories.length} directories`,
    });
    
    // Step 2: Copy default configuration
    const configFiles = await copyDefaultConfig();
    steps.push({
      name: 'Copy default configuration',
      status: configFiles.copied ? 'success' : 'skipped',
      details: configFiles.message,
    });
    
    // Step 3: Set up environment file
    const envSetup = await setupEnvironment();
    steps.push({
      name: 'Set up environment',
      status: envSetup.created ? 'success' : 'skipped',
      details: envSetup.message,
    });
    
    // Step 4: Check dependencies
    const deps = await checkDependencies();
    steps.push({
      name: 'Check dependencies',
      status: deps.allGood ? 'success' : 'warning',
      details: deps.message,
    });
    
    // Step 5: Create example profiles
    const profiles = await createExampleProfiles();
    steps.push({
      name: 'Create example profiles',
      status: profiles.created > 0 ? 'success' : 'skipped',
      details: `Created ${profiles.created} example profiles`,
    });
    
    const duration = Date.now() - startTime;
    
    return {
      steps,
      duration,
      success: true,
    };
    
  } catch (error) {
    logger.error('Installation failed', { 
      error: error.message,
      stack: error.stack, 
    });
    throw new CommandError(
      `Installation failed: ${error.message}`,
      'install:copytree',
    );
  }
}

/**
 * Create required directories
 */
async function createDirectories() {
  const homeDir = os.homedir();
  const directories = [
    path.join(homeDir, '.copytree'),
    path.join(homeDir, '.copytree', 'profiles'),
    path.join(homeDir, '.copytree', 'cache'),
    path.join(homeDir, '.copytree', 'cache', 'ai'),
    path.join(homeDir, '.copytree', 'cache', 'transforms'),
    path.join(homeDir, '.copytree', 'external-sources'),
    path.join(homeDir, '.copytree', 'logs'),
  ];
  
  const created = [];
  
  for (const dir of directories) {
    if (!await fs.pathExists(dir)) {
      await fs.ensureDir(dir);
      created.push(dir);
      logger.info('Created directory', { path: dir });
    }
  }
  
  return created;
}

/**
 * Copy default configuration files
 */
async function copyDefaultConfig() {
  const homeDir = os.homedir();
  const userConfigPath = path.join(homeDir, '.copytree', 'config.yml');
  
  if (await fs.pathExists(userConfigPath)) {
    return {
      copied: false,
      message: 'User config already exists',
    };
  }
  
  // Create default configuration
  const defaultConfig = `# CopyTree User Configuration
# This file overrides default settings

# Application settings
app:
  debug: false
  colors: true

# AI settings
ai:
  provider: gemini
  model: gemini-2.5-flash
  temperature: 0.3
  
# Cache settings
cache:
  enabled: true
  ttl: 86400  # 24 hours
  
# Output defaults
output:
  format: xml
  prettyPrint: true
  includeMetadata: true
  
# Git integration
git:
  respectGitignore: true
  includeUntracked: false
`;
  
  await fs.writeFile(userConfigPath, defaultConfig, 'utf8');
  
  return {
    copied: true,
    message: `Created ${userConfigPath}`,
  };
}

/**
 * Set up environment file
 */
async function setupEnvironment() {
  const homeDir = os.homedir();
  const envPath = path.join(homeDir, '.copytree', '.env');
  
  if (await fs.pathExists(envPath)) {
    return {
      created: false,
      message: 'Environment file already exists',
    };
  }
  
  const envContent = `# CopyTree Environment Variables

# API Keys
GEMINI_API_KEY=
# OPENAI_API_KEY=
# ANTHROPIC_API_KEY=

# Optional Configuration
# COPYTREE_MAX_FILE_SIZE=10485760
# COPYTREE_MAX_TOTAL_SIZE=104857600
# COPYTREE_CACHE_TTL=86400
# COPYTREE_DEBUG=false
`;
  
  await fs.writeFile(envPath, envContent, 'utf8');
  
  return {
    created: true,
    message: `Created ${envPath}`,
  };
}

/**
 * Check system dependencies
 */
async function checkDependencies() {
  const checks = [];
  const missing = [];
  
  // Check for Git
  try {
    execSync('git --version', { stdio: 'ignore' });
    checks.push('Git');
  } catch (_error) {
    missing.push('Git (required for git integration features)');
  }
  
  // Check for Pandoc (optional)
  try {
    execSync('pandoc --version', { stdio: 'ignore' });
    checks.push('Pandoc');
  } catch (_error) {
    // Optional dependency
  }
  
  // Check for Node version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));
  if (majorVersion < 16) {
    missing.push(`Node.js 16+ (current: ${nodeVersion})`);
  }
  
  if (missing.length > 0) {
    return {
      allGood: false,
      message: `Missing: ${missing.join(', ')}`,
    };
  }
  
  return {
    allGood: true,
    message: 'All dependencies found',
  };
}

/**
 * Create example profiles
 */
async function createExampleProfiles() {
  const homeDir = os.homedir();
  const profilesDir = path.join(homeDir, '.copytree', 'profiles');
  let created = 0;
  
  // Example minimal profile
  const minimalProfile = `name: minimal
description: Minimal profile for quick outputs
version: 1.0.0

include:
  - "src/**/*"
  - "*.json"
  - "*.md"

exclude:
  - "**/node_modules/**"
  - "**/.git/**"
  - "**/dist/**"
  - "**/build/**"
  - "**/*.test.*"
  - "**/*.spec.*"

options:
  maxFileSize: 1048576  # 1MB
  maxFileCount: 100

transformers:
  firstlines:
    enabled: true
    options:
      lineCount: 50

output:
  format: xml
  characterLimit: 50000
`;
  
  const minimalPath = path.join(profilesDir, 'minimal.yml');
  if (!await fs.pathExists(minimalPath)) {
    await fs.writeFile(minimalPath, minimalProfile, 'utf8');
    created++;
  }
  
  // Example documentation profile
  const docsProfile = `name: documentation
description: Profile optimized for documentation
version: 1.0.0

include:
  - "**/*.md"
  - "**/*.mdx"
  - "**/*.rst"
  - "**/*.txt"
  - "docs/**/*"
  - "README*"
  - "LICENSE*"

exclude:
  - "**/node_modules/**"
  - "**/.git/**"

transformers:
  markdown:
    enabled: true
    options:
      mode: original

output:
  format: markdown
  includeMetadata: false
`;
  
  const docsPath = path.join(profilesDir, 'documentation.yml');
  if (!await fs.pathExists(docsPath)) {
    await fs.writeFile(docsPath, docsProfile, 'utf8');
    created++;
  }
  
  return { created };
}

export default installCopytreeCommand;