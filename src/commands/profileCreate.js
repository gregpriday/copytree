const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');
const yaml = require('js-yaml');
const { globby } = require('globby');
const { logger } = require('../utils/logger');
const { CommandError } = require('../utils/errors');
const { AIService } = require('../services/AIService');
const ProfileLoader = require('../profiles/ProfileLoader');

/**
 * Profile create command - Create new profile by scanning project
 */
async function profileCreateCommand(targetPath, options) {
  const startTime = Date.now();
  const basePath = targetPath || process.cwd();
  
  try {
    console.log(chalk.blue.bold('CopyTree Profile Creator\n'));
    console.log(chalk.gray(`Analyzing project: ${basePath}\n`));
    
    // Analyze project structure
    const analysis = await analyzeProject(basePath);
    console.log(chalk.green('✓ Project analysis complete'));
    console.log(chalk.gray(`  Found ${analysis.fileCount} files`));
    console.log(chalk.gray(`  Detected: ${analysis.detectedFrameworks.join(', ') || 'Generic project'}\n`));
    
    // Generate AI suggestions if API key available
    let aiProfile = null;
    if (process.env.GEMINI_API_KEY && !options.skipAi) {
      console.log(chalk.blue('Generating AI-powered profile suggestions...'));
      aiProfile = await generateAIProfile(analysis, options);
      console.log(chalk.green('✓ AI suggestions generated\n'));
    }
    
    // Interactive profile creation
    const profile = await createInteractiveProfile(analysis, aiProfile, options);
    
    // Determine save location
    const saveLocation = await determineSaveLocation(profile.name, options);
    
    // Save profile
    await saveProfile(profile, saveLocation);
    
    const duration = Date.now() - startTime;
    console.log(chalk.green(`\n✓ Profile created successfully in ${duration}ms`));
    console.log(chalk.gray(`  Location: ${saveLocation}`));
    
    // Test the profile
    if (!options.skipTest) {
      console.log(chalk.blue('\nTesting profile...'));
      try {
        const profileLoader = new ProfileLoader();
        await profileLoader.load(saveLocation);
        console.log(chalk.green('✓ Profile validation passed'));
      } catch (error) {
        console.log(chalk.yellow('⚠ Profile validation warning:', error.message));
      }
    }
    
    return profile;
  } catch (error) {
    logger.error('Profile create failed', { 
      path: basePath,
      error: error.message,
      stack: error.stack 
    });
    throw new CommandError(
      `Profile creation failed: ${error.message}`,
      'profile:create'
    );
  }
}

/**
 * Analyze project structure
 */
async function analyzeProject(basePath) {
  const analysis = {
    basePath,
    fileCount: 0,
    totalSize: 0,
    fileTypes: new Map(),
    directories: new Set(),
    detectedFrameworks: [],
    suggestedPatterns: {
      include: [],
      exclude: []
    },
    sampleFiles: []
  };
  
  // Get all files (limited scan for performance)
  const files = await globby(['**/*'], {
    cwd: basePath,
    ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
    stats: true,
    followSymbolicLinks: false,
    onlyFiles: true
  });
  
  // Analyze files
  for (const file of files.slice(0, 1000)) { // Limit to 1000 files for analysis
    analysis.fileCount++;
    analysis.totalSize += file.stats.size;
    
    // Track file types
    const ext = path.extname(file.path).toLowerCase();
    analysis.fileTypes.set(ext, (analysis.fileTypes.get(ext) || 0) + 1);
    
    // Track directories
    const dir = path.dirname(file.path);
    if (dir !== '.') {
      analysis.directories.add(dir.split('/')[0]);
    }
    
    // Collect sample files for AI analysis
    if (analysis.sampleFiles.length < 20 && file.stats.size < 50000) {
      try {
        const content = await fs.readFile(path.join(basePath, file.path), 'utf8');
        analysis.sampleFiles.push({
          path: file.path,
          size: file.stats.size,
          content: content.slice(0, 1000) // First 1000 chars
        });
      } catch (error) {
        // Ignore read errors
      }
    }
  }
  
  // Detect frameworks
  analysis.detectedFrameworks = await detectFrameworks(basePath, analysis);
  
  // Generate suggested patterns
  analysis.suggestedPatterns = generatePatternSuggestions(analysis);
  
  return analysis;
}

/**
 * Detect common frameworks and project types
 */
async function detectFrameworks(basePath, analysis) {
  const frameworks = [];
  
  // Check for framework-specific files
  const checks = [
    { file: 'package.json', detect: async () => {
      const pkg = await fs.readJson(path.join(basePath, 'package.json'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      if (deps['@angular/core']) return 'Angular';
      if (deps['react']) return 'React';
      if (deps['vue']) return 'Vue';
      if (deps['@sveltejs/kit']) return 'SvelteKit';
      if (deps['next']) return 'Next.js';
      if (deps['express']) return 'Express';
      if (deps['@nestjs/core']) return 'NestJS';
      return null;
    }},
    { file: 'composer.json', detect: async () => {
      const composer = await fs.readJson(path.join(basePath, 'composer.json'));
      if (composer.require?.['laravel/framework']) return 'Laravel';
      if (composer.require?.['symfony/framework-bundle']) return 'Symfony';
      return 'PHP';
    }},
    { file: 'requirements.txt', detect: () => 'Python' },
    { file: 'Pipfile', detect: () => 'Python' },
    { file: 'go.mod', detect: () => 'Go' },
    { file: 'Cargo.toml', detect: () => 'Rust' },
    { file: 'build.gradle', detect: () => 'Java/Gradle' },
    { file: 'pom.xml', detect: () => 'Java/Maven' },
    { file: 'Gemfile', detect: () => 'Ruby' },
    { file: 'mix.exs', detect: () => 'Elixir' }
  ];
  
  for (const check of checks) {
    if (await fs.pathExists(path.join(basePath, check.file))) {
      try {
        const framework = await check.detect();
        if (framework) frameworks.push(framework);
      } catch (error) {
        // Ignore detection errors
      }
    }
  }
  
  return [...new Set(frameworks)];
}

/**
 * Generate pattern suggestions based on analysis
 */
function generatePatternSuggestions(analysis) {
  const suggestions = {
    include: ['**/*'],
    exclude: []
  };
  
  // Common excludes
  const commonExcludes = [
    'node_modules',
    '.git',
    'dist',
    'build',
    'coverage',
    '.cache',
    'tmp',
    'temp',
    'logs',
    'vendor'
  ];
  
  for (const dir of analysis.directories) {
    if (commonExcludes.includes(dir)) {
      suggestions.exclude.push(`**/${dir}/**`);
    }
  }
  
  // Framework-specific excludes
  if (analysis.detectedFrameworks.includes('Next.js')) {
    suggestions.exclude.push('**/.next/**', '**/out/**');
  }
  if (analysis.detectedFrameworks.includes('SvelteKit')) {
    suggestions.exclude.push('**/.svelte-kit/**');
  }
  
  // Large file excludes
  suggestions.exclude.push('**/*.log', '**/*.tmp', '**/*.temp');
  
  // Binary file excludes (unless specifically wanted)
  const binaryExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.zip', '.tar', '.gz'];
  for (const [ext, count] of analysis.fileTypes) {
    if (binaryExtensions.includes(ext) && count > 10) {
      suggestions.exclude.push(`**/*${ext}`);
    }
  }
  
  return suggestions;
}

/**
 * Generate AI-powered profile using Gemini
 */
async function generateAIProfile(analysis, options) {
  const aiService = new AIService();
  const characterLimit = options.characterLimit || 1500;
  
  // Prepare context for AI
  const context = {
    frameworks: analysis.detectedFrameworks,
    fileTypes: Array.from(analysis.fileTypes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10),
    directories: Array.from(analysis.directories).slice(0, 20),
    totalFiles: analysis.fileCount,
    sampleFiles: analysis.sampleFiles.slice(0, 5).map(f => ({
      path: f.path,
      preview: f.content.slice(0, 200)
    }))
  };
  
  const prompt = `Generate a copytree profile YAML for this project. The profile should be optimized for creating a comprehensive but focused snapshot of the codebase.

Project details:
${JSON.stringify(context, null, 2)}

Requirements:
1. Create smart include/exclude patterns based on the project type
2. Suggest appropriate transformers for different file types
3. Aim for a total output under ${characterLimit} characters
4. Focus on source code and configuration files
5. Exclude generated files, dependencies, and large binaries

Return a valid YAML profile with:
- name: descriptive project name
- description: what this profile captures
- include: array of glob patterns
- exclude: array of glob patterns
- transformers: object with transformer settings

Example format:
name: my-project
description: Captures source code and configs
include:
  - "src/**/*"
  - "*.json"
exclude:
  - "**/node_modules/**"
transformers:
  markdown:
    enabled: true
    options:
      mode: strip`;
  
  try {
    const response = await aiService.generate(prompt, {
      temperature: 0.3,
      maxTokens: 1000
    });
    
    // Parse YAML response
    const profile = yaml.load(response);
    
    // Validate and clean up
    if (!profile.name) profile.name = 'ai-generated';
    if (!profile.description) profile.description = 'AI-generated profile';
    if (!Array.isArray(profile.include)) profile.include = ['**/*'];
    if (!Array.isArray(profile.exclude)) profile.exclude = [];
    
    return profile;
  } catch (error) {
    logger.warn('AI profile generation failed', { error: error.message });
    return null;
  }
}

/**
 * Create profile interactively
 */
async function createInteractiveProfile(analysis, aiProfile, options) {
  let profile = aiProfile || {
    name: path.basename(analysis.basePath),
    description: `Profile for ${path.basename(analysis.basePath)} project`,
    include: analysis.suggestedPatterns.include,
    exclude: analysis.suggestedPatterns.exclude,
    transformers: {}
  };
  
  if (!options.nonInteractive) {
    console.log(chalk.blue('\nCustomize your profile:\n'));
    
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Profile name:',
        default: profile.name,
        validate: input => input.length > 0
      },
      {
        type: 'input',
        name: 'description',
        message: 'Profile description:',
        default: profile.description
      },
      {
        type: 'editor',
        name: 'include',
        message: 'Include patterns (one per line):',
        default: profile.include.join('\n')
      },
      {
        type: 'editor',
        name: 'exclude',
        message: 'Exclude patterns (one per line):',
        default: profile.exclude.join('\n')
      },
      {
        type: 'confirm',
        name: 'enableTransformers',
        message: 'Enable file transformers?',
        default: true
      }
    ]);
    
    // Update profile with answers
    profile.name = answers.name;
    profile.description = answers.description;
    profile.include = answers.include.split('\n').filter(line => line.trim());
    profile.exclude = answers.exclude.split('\n').filter(line => line.trim());
    
    // Configure transformers
    if (answers.enableTransformers) {
      const transformerAnswers = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'transformers',
          message: 'Select transformers to enable:',
          choices: [
            { name: 'Markdown stripper', value: 'markdown', checked: true },
            { name: 'CSV preview', value: 'csv', checked: true },
            { name: 'JSON formatter', value: 'json', checked: true },
            { name: 'Binary placeholder', value: 'binary', checked: true },
            { name: 'PDF text extraction', value: 'pdf', checked: false },
            { name: 'Image descriptions', value: 'image-description', checked: false }
          ]
        }
      ]);
      
      for (const transformer of transformerAnswers.transformers) {
        profile.transformers[transformer] = { enabled: true };
      }
    }
  }
  
  // Add metadata
  profile.version = '1.0.0';
  profile.created = new Date().toISOString();
  
  return profile;
}

/**
 * Determine where to save the profile
 */
async function determineSaveLocation(profileName, options) {
  if (options.output) {
    return options.output;
  }
  
  const locations = {
    project: path.join(process.cwd(), '.copytree', `${profileName}.yml`),
    user: path.join(require('os').homedir(), '.copytree', 'profiles', `${profileName}.yml`),
    current: path.join(process.cwd(), `${profileName}.copytree.yml`)
  };
  
  if (options.global) {
    await fs.ensureDir(path.dirname(locations.user));
    return locations.user;
  }
  
  if (options.project) {
    await fs.ensureDir(path.dirname(locations.project));
    return locations.project;
  }
  
  // Default to current directory
  return locations.current;
}

/**
 * Save profile to file
 */
async function saveProfile(profile, filePath) {
  const content = yaml.dump(profile, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false
  });
  
  await fs.writeFile(filePath, content, 'utf8');
  
  logger.info('Profile saved', {
    path: filePath,
    name: profile.name
  });
}

module.exports = profileCreateCommand;