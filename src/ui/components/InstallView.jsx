const React = require('react');
const { useEffect, useState } = React;
const { Box, Text } = require('ink');
const { useAppContext } = require('../contexts/AppContext.js');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const inquirer = require('inquirer');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const InstallStep = ({ step, isActive, isCompleted }) => {
  const getIcon = () => {
    if (isCompleted) {
      return step.status === 'success' ? '✓' : 
				   step.status === 'warning' ? '⚠' : '○';
    }
    if (isActive) {
      return '⏳';
    }
    return '○';
  };

  const getColor = () => {
    if (isCompleted) {
      return step.status === 'success' ? 'green' :
				   step.status === 'warning' ? 'yellow' : 'gray';
    }
    if (isActive) {
      return 'blue';
    }
    return 'gray';
  };

  return React.createElement(
    Box,
    { marginBottom: 0 },
    React.createElement(
      Text,
      { color: getColor() },
      `${getIcon()} ${step.name}: ${step.details || ''}`,
    ),
  );
};

const NextSteps = () => {
  return React.createElement(
    Box,
    { flexDirection: 'column', marginTop: 1 },
    React.createElement(
      Text,
      { bold: true, color: 'yellow' },
      'Next Steps:',
    ),
    React.createElement(
      Box,
      { marginTop: 1, flexDirection: 'column', marginLeft: 2 },
      React.createElement(Text, null, '1. Create your first profile:'),
      React.createElement(
        Text,
        { dimColor: true, marginLeft: 2 },
        'copytree profile:create',
      ),
      React.createElement(Text, { marginTop: 1 }, '2. Run copytree on your project:'),
      React.createElement(
        Text,
        { dimColor: true, marginLeft: 2 },
        'copytree --profile default',
      ),
      React.createElement(Text, { marginTop: 1 }, '3. Use AI-powered transformers:'),
      React.createElement(
        Text,
        { dimColor: true, marginLeft: 2 },
        'copytree --transform',
      ),
    ),
  );
};

const InstallView = () => {
  const { updateState } = useAppContext();
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState([]);
  const [isCompleted, setIsCompleted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    const runInstallation = async () => {
      const startTime = Date.now();
			
      try {
        const installSteps = [
          { name: 'Create directories', details: '' },
          { name: 'Copy default configuration', details: '' },
          { name: 'Set up environment', details: '' },
          { name: 'Set up Gemini API key', details: '' },
          { name: 'Check dependencies', details: '' },
          { name: 'Create example profiles', details: '' },
        ];

        setSteps(installSteps);

        // Step 1: Create directories
        setCurrentStep(0);
        const directories = await createDirectories();
        installSteps[0] = {
          name: 'Create directories',
          status: 'success',
          details: `Created ${directories.length} directories`,
        };
        setSteps([...installSteps]);

        // Step 2: Copy default configuration
        setCurrentStep(1);
        const configFiles = await copyDefaultConfig();
        installSteps[1] = {
          name: 'Copy default configuration',
          status: configFiles.copied ? 'success' : 'skipped',
          details: configFiles.message,
        };
        setSteps([...installSteps]);

        // Step 3: Set up environment
        setCurrentStep(2);
        const envSetup = await setupEnvironment();
        installSteps[2] = {
          name: 'Set up environment',
          status: envSetup.created ? 'success' : 'skipped',
          details: envSetup.message,
        };
        setSteps([...installSteps]);

        // Step 4: Set up Gemini API key
        setCurrentStep(3);
        const apiKeySetup = await setupGeminiApiKey();
        installSteps[3] = {
          name: 'Set up Gemini API key',
          status: apiKeySetup.status,
          details: apiKeySetup.message,
        };
        setSteps([...installSteps]);

        // Step 5: Check dependencies
        setCurrentStep(4);
        const deps = await checkDependencies();
        installSteps[4] = {
          name: 'Check dependencies',
          status: deps.allGood ? 'success' : 'warning',
          details: deps.message,
        };
        setSteps([...installSteps]);

        // Step 6: Create example profiles
        setCurrentStep(5);
        const profiles = await createExampleProfiles();
        installSteps[5] = {
          name: 'Create example profiles',
          status: profiles.created > 0 ? 'success' : 'skipped',
          details: `Created ${profiles.created} example profiles`,
        };
        setSteps([...installSteps]);

        setDuration(Date.now() - startTime);
        setIsCompleted(true);
        setCurrentStep(-1);

      } catch (err) {
        setError(err.message);
        updateState({ error: err });
      }
    };

    runInstallation();
  }, [updateState]);

  if (error) {
    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(
        Text,
        { color: 'red', bold: true },
        '✗ Installation Failed',
      ),
      React.createElement(
        Text,
        { color: 'red' },
        error,
      ),
    );
  }

  return React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(
      Text,
      { bold: true, color: 'yellow' },
      'CopyTree Installation Setup',
    ),
    React.createElement(Box, { marginTop: 1 }, null),
    React.createElement(
      Text,
      { bold: true },
      'Installation Summary:',
    ),
    React.createElement(Box, { marginTop: 1 }, null),
    ...steps.map((step, index) =>
      React.createElement(InstallStep, {
        key: index,
        step,
        isActive: currentStep === index,
        isCompleted: currentStep > index || isCompleted,
      }),
    ),
    isCompleted && React.createElement(
      Box,
      { marginTop: 1 },
      React.createElement(
        Text,
        { color: 'green', bold: true },
        `✓ Installation completed in ${duration}ms`,
      ),
    ),
    isCompleted && React.createElement(NextSteps),
  );
};

/**
 * Create required directories (same as original implementation)
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
    }
  }

  return created;
}

/**
 * Copy default configuration files (same as original implementation)
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
 * Set up environment file (same as original implementation)
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
 * Check system dependencies (same as original implementation)
 */
async function checkDependencies() {
  const checks = [];
  const missing = [];

  // Check for Git
  try {
    execSync('git --version', { stdio: 'ignore' });
    checks.push('Git');
  } catch (error) {
    missing.push('Git (required for git integration features)');
  }

  // Check for Pandoc (optional)
  try {
    execSync('pandoc --version', { stdio: 'ignore' });
    checks.push('Pandoc');
  } catch (error) {
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
 * Create example profiles (same as original implementation)
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

/**
 * Set up Gemini API key interactively
 */
async function setupGeminiApiKey() {
  const homeDir = os.homedir();
  const envPath = path.join(homeDir, '.copytree', '.env');
	
  try {
    // Read existing .env file
    let envContent = '';
    if (await fs.pathExists(envPath)) {
      envContent = await fs.readFile(envPath, 'utf8');
    }
		
    // Check if API key is already set
    const hasApiKey = envContent.includes('GEMINI_API_KEY=') && 
						  !envContent.match(/GEMINI_API_KEY=\s*$/m);
		
    if (hasApiKey) {
      return {
        status: 'skipped',
        message: 'API key already configured',
      };
    }
		
    // Prompt for API key
    console.log('\n'); // Add space for inquirer prompt
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'apiKey',
        message: 'Enter your Gemini API key (get one at https://makersuite.google.com/app/apikey):',
        validate: (input) => {
          if (!input || input.trim().length === 0) {
            return 'API key is required for AI features';
          }
          if (input.trim().length < 20) {
            return 'API key seems too short';
          }
          return true;
        },
      },
      {
        type: 'confirm',
        name: 'validateKey',
        message: 'Would you like to validate the API key now?',
        default: true,
      },
    ]);
		
    // Optionally validate the API key
    if (answers.validateKey) {
      try {
        const genAI = new GoogleGenerativeAI(answers.apiKey.trim());
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        await model.generateContent('Hello, this is a test.');
        console.log('\n✓ API key validated successfully!');
      } catch (error) {
        console.log('\n⚠ API key validation failed:', error.message);
        const continueAnyway = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'continue',
            message: 'Continue with this API key anyway?',
            default: false,
          },
        ]);
        if (!continueAnyway.continue) {
          return {
            status: 'warning',
            message: 'API key setup cancelled',
          };
        }
      }
    }
		
    // Update .env file with the API key
    if (envContent.includes('GEMINI_API_KEY=')) {
      // Replace existing empty key
      envContent = envContent.replace(/GEMINI_API_KEY=.*$/m, `GEMINI_API_KEY=${answers.apiKey.trim()}`);
    } else {
      // Add new key
      const apiSection = envContent.indexOf('# API Keys');
      if (apiSection > -1) {
        const lines = envContent.split('\n');
        let insertIndex = -1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('# API Keys')) {
            insertIndex = i + 1;
            break;
          }
        }
        if (insertIndex > -1) {
          lines.splice(insertIndex, 0, `GEMINI_API_KEY=${answers.apiKey.trim()}`);
          envContent = lines.join('\n');
        }
      } else {
        envContent += `\nGEMINI_API_KEY=${answers.apiKey.trim()}\n`;
      }
    }
		
    await fs.writeFile(envPath, envContent, 'utf8');
		
    return {
      status: 'success',
      message: 'API key configured successfully',
    };
		
  } catch (error) {
    return {
      status: 'warning',
      message: `Failed to set API key: ${error.message}`,
    };
  }
}

module.exports = InstallView;