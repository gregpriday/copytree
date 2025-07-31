const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const joi = require('joi');
const { logger } = require('../utils/logger');
const { CommandError } = require('../utils/errors');
const { config, ConfigManager } = require('../config/ConfigManager');

/**
 * Config validate command - Validate application configuration
 * (Now handled by ValidationView component)
 */
async function configValidateCommand(options = {}) {
  try {
    // All validation is now handled by the ValidationView component
    // This function is kept for backward compatibility
    return {
      success: true,
      message: 'Validation handled by UI component'
    };
    
  } catch (error) {
    logger.error('Failed to validate configuration', { 
      error: error.message,
      stack: error.stack 
    });
    throw new CommandError(
      `Failed to validate configuration: ${error.message}`,
      'config:validate'
    );
  }
}

/**
 * Validate AI configuration
 */
function validateAIConfig(config, warnings) {
  if (!config.provider) {
    warnings.push('No AI provider configured');
  }
  
  if (config.provider === 'gemini' && !config.gemini?.apiKey) {
    warnings.push('Gemini provider selected but no API key configured');
  }
  
  if (!config.cacheEnabled) {
    warnings.push('AI caching is disabled - this may increase API costs');
  }
}

/**
 * Validate copytree configuration
 */
function validateCopytreeConfig(config, warnings) {
  if (config.maxFileSize && config.maxFileSize < 1024) {
    warnings.push('maxFileSize is very small (< 1KB)');
  }
  
  if (config.maxFileCount && config.maxFileCount < 10) {
    warnings.push('maxFileCount is very low (< 10)');
  }
  
  if (!config.defaultExclusions || config.defaultExclusions.length === 0) {
    warnings.push('No default exclusions configured');
  }
}

/**
 * Validate instructions configuration
 */
async function validateInstructionsConfig(config, warnings) {
  const InstructionsLoader = require('../services/InstructionsLoader');
  
  try {
    const instructionsLoader = new InstructionsLoader();
    const defaultInstructions = config.defaultInstructions || 'default';
    
    // Check if default instructions exist
    const exists = await instructionsLoader.exists(defaultInstructions);
    if (!exists) {
      warnings.push(`Default instructions '${defaultInstructions}' not found`);
    }
    
    // List available instructions
    const available = await instructionsLoader.list();
    if (available.length === 0) {
      warnings.push('No instructions files found in app or user directories');
    }
    
  } catch (error) {
    warnings.push(`Failed to validate instructions: ${error.message}`);
  }
}

/**
 * Validate cache configuration
 */
function validateCacheConfig(config, warnings) {
  if (!config.enabled) {
    warnings.push('Caching is disabled - this may impact performance');
  }
  
  if (config.ttl && config.ttl < 60) {
    warnings.push('Cache TTL is very short (< 1 minute)');
  }
}

/**
 * Display configuration object recursively
 */
function displayConfigObject(obj, indent = '') {
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      console.log(`${indent}${key}:`);
      displayConfigObject(value, indent + '  ');
    } else if (Array.isArray(value)) {
      console.log(`${indent}${key}: [${value.length} items]`);
      if (value.length > 0 && value.length <= 5) {
        value.forEach(item => {
          console.log(`${indent}  - ${item}`);
        });
      }
    } else {
      // Mask sensitive values
      let displayValue = value;
      if (key.toLowerCase().includes('key') || 
          key.toLowerCase().includes('secret') ||
          key.toLowerCase().includes('password')) {
        displayValue = value ? '***' : '(not set)';
      }
      console.log(`${indent}${key}: ${displayValue}`);
    }
  }
}

module.exports = configValidateCommand;