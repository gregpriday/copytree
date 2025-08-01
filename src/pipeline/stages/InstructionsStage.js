const Stage = require('../Stage');
const InstructionsLoader = require('../../services/InstructionsLoader');
const { config } = require('../../config/ConfigManager');

/**
 * Instructions Stage - Loads and adds instructions to pipeline input
 * Handles loading instructions from user directory or app directory
 */
class InstructionsStage extends Stage {
  constructor(options = {}) {
    super(options);
    this.instructionsLoader = new InstructionsLoader();
  }

  async process(input) {
    const startTime = Date.now();
    
    // Check if instructions are disabled
    if (input.options?.noInstructions || input.options?.instructions === false) {
      this.log('Instructions disabled via --no-instructions', 'debug');
      return input;
    }
    
    this.log('InstructionsStage processing started', 'debug');

    try {
      // Determine which instructions to load
      let instructionsName = input.options?.instructions;
      
      // If instructions is true but not a string, use default
      if (instructionsName === true || !instructionsName) {
        instructionsName = config().get('app.defaultInstructions', 'default');
      }
      
      this.log(`Loading instructions: ${instructionsName}`, 'debug');
      
      // Load instructions
      this.log(`Loading instructions: ${instructionsName}`, 'debug');
      let instructionsContent;
      try {
        instructionsContent = await this.instructionsLoader.load(instructionsName);
      } catch (error) {
        this.log(`Instructions '${instructionsName}' not found, continuing without instructions: ${error.message}`, 'warn');
        return input;
      }
      
      if (!instructionsContent) {
        this.log(`No instructions content found for: ${instructionsName}`, 'warn');
        return input;
      }
      
      this.log(`Instructions loaded successfully, length: ${instructionsContent.length}`, 'debug');

      // Add instructions to input
      const result = {
        ...input,
        instructions: instructionsContent,
        instructionsName: instructionsName
      };

      this.log(`Successfully loaded instructions '${instructionsName}' in ${this.getElapsedTime(startTime)}`, 'info');
      
      return result;

    } catch (error) {
      // Handle errors gracefully - log warning and continue without instructions
      this.log(`Failed to load instructions: ${error.message}`, 'warn');
      
      // If default instructions fail and we're not explicitly asking for a custom one,
      // continue without instructions rather than failing the entire pipeline
      if (!input.options?.instructions) {
        this.log('Continuing without instructions', 'info');
        return input;
      }
      
      // If a specific instructions set was requested and failed, that's an error
      throw error;
    }
  }

  /**
   * Validate that instructions exist if specified
   * @param {Object} input - Input to validate
   * @returns {boolean} - True if valid
   */
  async validate(input) {
    // Skip validation if instructions are disabled
    if (input.options?.noInstructions) {
      return true;
    }

    const instructionsName = input.options?.instructions || 
                            config().get('app.defaultInstructions', 'default');
    
    // Check if instructions exist
    const exists = await this.instructionsLoader.exists(instructionsName);
    
    if (!exists && input.options?.instructions) {
      // Only throw error if a specific instructions set was requested
      throw new Error(`Instructions '${instructionsName}' not found`);
    }
    
    return true;
  }
}

module.exports = InstructionsStage;