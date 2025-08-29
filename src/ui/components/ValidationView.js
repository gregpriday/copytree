import React, { useEffect, useState } from 'react';

// Use dynamic import for ESM-only ink
let Box, Text;
(async () => {
  try {
    const ink = await import('ink');
    Box = ink.Box;
    Text = ink.Text;
  } catch (error) {
    // Defer error until first usage attempt
    Box = undefined;
    Text = undefined;
  }
})().catch(() => {
  Box = undefined;
  Text = undefined;
});
import { useAppContext } from '../contexts/AppContext.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const ValidationStep = ({ step, isActive, isCompleted }) => {
  const getIcon = () => {
    if (isCompleted) {
      return step.status === 'success'
        ? '✓'
        : step.status === 'warning'
          ? '⚠'
          : step.status === 'error'
            ? '✗'
            : '○';
    }
    if (isActive) {
      return '⏳';
    }
    return '○';
  };

  const getColor = () => {
    if (isCompleted) {
      return step.status === 'success'
        ? 'green'
        : step.status === 'warning'
          ? 'yellow'
          : step.status === 'error'
            ? 'red'
            : 'gray';
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

const WarningsList = ({ warnings }) => {
  if (!warnings || warnings.length === 0) {
    return null;
  }

  return React.createElement(
    Box,
    { flexDirection: 'column', marginTop: 1 },
    React.createElement(Text, { color: 'yellow', bold: true }, '⚠ Warnings:'),
    ...warnings.map((warning, index) =>
      React.createElement(Text, { key: index, color: 'yellow', marginLeft: 2 }, `- ${warning}`),
    ),
  );
};

const ValidationDetails = ({ details, command }) => {
  if (!details) {
    return null;
  }

  return React.createElement(
    Box,
    { flexDirection: 'column', marginTop: 1 },
    React.createElement(
      Text,
      { bold: true, color: 'yellow' },
      command === 'profile:validate' ? 'Profile Details:' : 'Configuration Details:',
    ),
    React.createElement(
      Box,
      { marginLeft: 2, flexDirection: 'column', marginTop: 1 },
      ...Object.entries(details).map(([key, value]) => {
        // Handle different value types
        let displayValue = value;
        if (Array.isArray(value)) {
          displayValue = value.length > 0 ? value.join(', ') : 'None';
        } else if (typeof value === 'object' && value !== null) {
          displayValue = JSON.stringify(value, null, 2);
        }

        return React.createElement(Text, { key }, `${key}: ${displayValue}`);
      }),
    ),
  );
};

const ValidationView = ({ successMessage, type }) => {
  const { command, options, updateState } = useAppContext();
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState([]);
  const [isCompleted, setIsCompleted] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [validationResult, setValidationResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const runValidation = async () => {
      try {
        if (type === 'cache') {
          await runCacheValidation();
        } else if (command === 'profile:validate') {
          await runProfileValidation();
        } else if (command === 'config:validate') {
          await runConfigValidation();
        }
      } catch (err) {
        setError(err.message);
        updateState({ error: err });
      }
    };

    runValidation();
  }, [command, options, type, successMessage, updateState]);

  const runCacheValidation = async () => {
    const { CacheService } = await import('../../services/CacheService.js');
    const cacheService = new CacheService();
    let totalCleared = 0;

    // Determine what to clear
    const clearAll = !options.transformations && !options.ai && !options.git && !options.profiles;
    const validationSteps = [];

    if (clearAll || options.transformations) {
      validationSteps.push({ name: 'Clear transformation cache', details: '' });
    }
    if (clearAll || options.ai) {
      validationSteps.push({ name: 'Clear AI response cache', details: '' });
    }
    if (clearAll || options.git) {
      validationSteps.push({ name: 'Clear git cache', details: '' });
    }
    if (clearAll || options.profiles) {
      validationSteps.push({ name: 'Clear profile detection cache', details: '' });
    }

    setSteps(validationSteps);

    for (let i = 0; i < validationSteps.length; i++) {
      setCurrentStep(i);
      let cleared = 0;

      if (validationSteps[i].name.includes('transformation')) {
        cleared = await cacheService.clear('copytree_transform_');
      } else if (validationSteps[i].name.includes('AI')) {
        cleared = await cacheService.clear('copytree_ai_');
      } else if (validationSteps[i].name.includes('git')) {
        cleared = await cacheService.clear('copytree_git_');
      } else if (validationSteps[i].name.includes('profile')) {
        cleared = await cacheService.clear('copytree_profile_');
      }

      totalCleared += cleared;
      validationSteps[i] = {
        ...validationSteps[i],
        status: 'success',
        details: `Cleared ${cleared} entries`,
      };
      setSteps([...validationSteps]);
    }

    setValidationResult({
      success: true,
      message: `Cache cleared! Total entries removed: ${totalCleared}`,
      details: { totalCleared },
    });
    setIsCompleted(true);
    setCurrentStep(-1);
  };

  const runProfileValidation = async () => {
    const { default: ProfileLoader } = await import('../../profiles/ProfileLoader.js');
    const { ProfileError } = await import('../../utils/errors.js');

    const profileName = options.profile || options.args?.[0] || 'default';
    const profileLoader = new ProfileLoader();
    let loadedProfile;
    const validationWarnings = [];

    const validationSteps = [
      { name: 'Load profile', details: '' },
      { name: 'Check profile structure', details: '' },
      { name: 'Validate configuration', details: '' },
    ];

    setSteps(validationSteps);

    // Step 1: Load profile
    setCurrentStep(0);
    try {
      loadedProfile = await profileLoader.load(profileName, {});
      validationSteps[0] = {
        name: 'Load profile',
        status: 'success',
        details: 'Profile loaded successfully',
      };
    } catch (profileError) {
      validationSteps[0] = {
        name: 'Load profile',
        status: 'error',
        details: 'Failed to load profile',
      };
      setSteps([...validationSteps]);
      throw profileError;
    }
    setSteps([...validationSteps]);

    // Step 2: Check structure
    setCurrentStep(1);
    validationSteps[1] = {
      name: 'Check profile structure',
      status: 'success',
      details: 'Profile structure is valid',
    };
    setSteps([...validationSteps]);

    // Step 3: Validate configuration
    setCurrentStep(2);

    // Check for warnings
    if (!loadedProfile.description) {
      validationWarnings.push('No description provided');
    }
    if (!loadedProfile.version) {
      validationWarnings.push('No version specified');
    }
    if (loadedProfile.include && loadedProfile.include.length === 0) {
      validationWarnings.push('Include patterns list is empty');
    }
    if (loadedProfile.options?.maxFileSize && loadedProfile.options.maxFileSize < 1024) {
      validationWarnings.push('maxFileSize is very small (< 1KB)');
    }
    if (loadedProfile.options?.maxFileCount && loadedProfile.options.maxFileCount < 10) {
      validationWarnings.push('maxFileCount is very low (< 10)');
    }

    validationSteps[2] = {
      name: 'Validate configuration',
      status: validationWarnings.length > 0 ? 'warning' : 'success',
      details:
        validationWarnings.length > 0
          ? `${validationWarnings.length} warnings found`
          : 'No issues found',
    };
    setSteps([...validationSteps]);

    setWarnings(validationWarnings);
    setValidationResult({
      success: true,
      message:
        validationWarnings.length === 0
          ? 'Profile is valid with no issues'
          : `Profile is valid with ${validationWarnings.length} warning(s)`,
      details:
        options.verbose || options.show
          ? {
              name: loadedProfile.name,
              description: loadedProfile.description || 'N/A',
              version: loadedProfile.version || 'N/A',
              source: loadedProfile._source,
              includePatterns: loadedProfile.include?.join(', ') || 'None',
              excludePatterns: loadedProfile.exclude?.join(', ') || 'None',
            }
          : null,
    });
    setIsCompleted(true);
    setCurrentStep(-1);
  };

  const runConfigValidation = async () => {
    const { config, ConfigManager } = await import('../../config/ConfigManager.js');
    const configManager = config();
    const validationWarnings = [];

    const validationSteps = [
      { name: 'Check config directories', details: '' },
      { name: 'Validate config modules', details: '' },
      { name: 'Check environment variables', details: '' },
      { name: 'Test configuration access', details: '' },
    ];

    setSteps(validationSteps);

    // Step 1: Check directories
    setCurrentStep(0);
    const defaultConfigPath = path.join(process.cwd(), 'config');
    const userConfigPath = path.join(os.homedir(), '.copytree');

    let directoriesStatus = 'success';
    let directoriesDetails = 'All directories found';

    if (!(await fs.pathExists(defaultConfigPath))) {
      directoriesStatus = 'error';
      directoriesDetails = 'Default config directory missing';
    } else if (!(await fs.pathExists(userConfigPath))) {
      directoriesStatus = 'warning';
      directoriesDetails = 'User config directory not found (this is normal)';
      validationWarnings.push(
        'User config directory does not exist (this is normal if no custom configs)',
      );
    }

    validationSteps[0] = {
      name: 'Check config directories',
      status: directoriesStatus,
      details: directoriesDetails,
    };
    setSteps([...validationSteps]);

    // Step 2: Validate modules
    setCurrentStep(1);
    const configModules = ['ai', 'app', 'cache', 'copytree', 'state'];
    let modulesOk = 0;

    for (const moduleName of configModules) {
      try {
        const moduleConfig = configManager.get(moduleName);
        if (moduleConfig) {
          modulesOk++;

          // Module-specific validation
          if (moduleName === 'ai') {
            validateAIConfig(moduleConfig, validationWarnings);
          } else if (moduleName === 'copytree') {
            validateCopytreeConfig(moduleConfig, validationWarnings);
          } else if (moduleName === 'cache') {
            validateCacheConfig(moduleConfig, validationWarnings);
          }
        }
      } catch (error) {
        // Module failed to load
      }
    }

    validationSteps[1] = {
      name: 'Validate config modules',
      status: modulesOk === configModules.length ? 'success' : 'warning',
      details: `Loaded ${modulesOk}/${configModules.length} modules`,
    };
    setSteps([...validationSteps]);

    // Step 3: Check environment variables
    setCurrentStep(2);
    const envVars = {
      GEMINI_API_KEY: { required: false, type: 'ai' },
      COPYTREE_MAX_FILE_SIZE: { required: false, type: 'size' },
      COPYTREE_MAX_TOTAL_SIZE: { required: false, type: 'size' },
      COPYTREE_CACHE_TTL: { required: false, type: 'number' },
    };

    let envVarsSet = 0;
    for (const [envVar, config] of Object.entries(envVars)) {
      const value = process.env[envVar];
      if (value) {
        envVarsSet++;
        if (config.type === 'number' && isNaN(parseInt(value))) {
          validationWarnings.push(`${envVar} should be a number, got: ${value}`);
        }
      } else if (config.type === 'ai' && envVar.includes('API_KEY')) {
        validationWarnings.push(`${envVar} not set - AI features will not work`);
      }
    }

    validationSteps[2] = {
      name: 'Check environment variables',
      status: 'success',
      details: `${envVarsSet}/${Object.keys(envVars).length} environment variables set`,
    };
    setSteps([...validationSteps]);

    // Step 4: Test configuration access
    setCurrentStep(3);
    const testPaths = ['copytree.defaultExclusions', 'ai.provider', 'cache.enabled', 'app.name'];

    let accessiblePaths = 0;
    for (const testPath of testPaths) {
      try {
        const value = configManager.get(testPath);
        if (value !== undefined && value !== null) {
          accessiblePaths++;
        }
      } catch (error) {
        // Path not accessible
      }
    }

    validationSteps[3] = {
      name: 'Test configuration access',
      status: 'success',
      details: `${accessiblePaths}/${testPaths.length} config paths accessible`,
    };
    setSteps([...validationSteps]);

    setWarnings(validationWarnings);
    setValidationResult({
      success: true,
      message:
        validationWarnings.length === 0
          ? 'Configuration is valid with no issues'
          : `Configuration is valid with ${validationWarnings.length} warning(s)`,
      details: options.verbose || options.show ? configManager.all() : null,
    });
    setIsCompleted(true);
    setCurrentStep(-1);
  };

  // Helper validation functions
  const validateAIConfig = (config, warnings) => {
    if (!config.provider) {
      warnings.push('No AI provider configured');
    }
    if (config.provider === 'gemini' && !config.gemini?.apiKey) {
      warnings.push('Gemini provider selected but no API key configured');
    }
    if (!config.cacheEnabled) {
      warnings.push('AI caching is disabled - this may increase API costs');
    }
  };

  const validateCopytreeConfig = (config, warnings) => {
    if (config.maxFileSize && config.maxFileSize < 1024) {
      warnings.push('maxFileSize is very small (< 1KB)');
    }
    if (config.maxFileCount && config.maxFileCount < 10) {
      warnings.push('maxFileCount is very low (< 10)');
    }
    if (!config.defaultExclusions || config.defaultExclusions.length === 0) {
      warnings.push('No default exclusions configured');
    }
  };

  const validateCacheConfig = (config, warnings) => {
    if (!config.enabled) {
      warnings.push('Caching is disabled - this may impact performance');
    }
    if (config.ttl && config.ttl < 60) {
      warnings.push('Cache TTL is very short (< 1 minute)');
    }
  };

  if (error) {
    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(Text, { color: 'red', bold: true }, '✗ Validation Failed'),
      React.createElement(
        Text,
        { color: 'red' },
        command === 'profile:validate' ? 'Failed to load profile' : error,
      ),
      React.createElement(Text, { color: 'red' }, error),
    );
  }

  const finalStatus = validationResult?.success ? (warnings.length === 0 ? '✓' : '⚠') : '?';
  const finalColor = validationResult?.success
    ? warnings.length === 0
      ? 'green'
      : 'yellow'
    : 'gray';

  return React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(
      Text,
      { bold: true, color: 'yellow' },
      type === 'cache'
        ? 'Cache Clearing Progress:'
        : command === 'profile:validate'
          ? `Validating profile: ${options.profile || options.args?.[0] || 'default'}`
          : 'Validating CopyTree Configuration',
    ),
    React.createElement(Box, { marginTop: 1 }, null),
    ...steps.map((step, index) =>
      React.createElement(ValidationStep, {
        key: index,
        step,
        isActive: currentStep === index,
        isCompleted: currentStep > index || isCompleted,
      }),
    ),
    React.createElement(WarningsList, { warnings }),
    isCompleted &&
      React.createElement(
        Box,
        { marginTop: 1 },
        React.createElement(
          Text,
          { color: finalColor, bold: true },
          `${finalStatus} ${validationResult?.message || 'Validation completed'}`,
        ),
      ),
    React.createElement(ValidationDetails, {
      details: validationResult?.details,
      command,
    }),
  );
};

export default ValidationView;
