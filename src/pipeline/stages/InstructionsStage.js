import Stage from '../Stage.js';
import InstructionsLoader from '../../services/InstructionsLoader.js';

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
        instructionsName = this.config.get('app.defaultInstructions', 'default');
      }

      this.log(`Loading instructions: ${instructionsName}`, 'debug');

      // Whether the caller named this set, or it is the configured default. A
      // set asked for by name must exist; falling back silently would emit a
      // document missing the instructions the caller believes are in it.
      const named =
        typeof input.options?.instructions === 'string' && input.options.instructions !== '';

      let instructionsContent;
      try {
        instructionsContent = await this.instructionsLoader.load(instructionsName);
      } catch (error) {
        if (named) throw error;
        this.log(
          `Instructions '${instructionsName}' not found, continuing without instructions: ${error.message}`,
          'warn',
        );
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
        instructionsName: instructionsName,
      };

      this.log(
        `Successfully loaded instructions '${instructionsName}' in ${this.getElapsedTime(startTime)}`,
        'info',
      );

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
   * Validate that instructions exist, when a specific set was named.
   *
   * There is no `exists()` probe here any more. `exists()` checked the user
   * directory and then the app directory, and `load()` — running moments later
   * in `process()` — checked exactly the same two paths again before reading.
   * That is four filesystem probes per run to answer one question, on a stage
   * that runs on every copy.
   *
   * `load()` already distinguishes "found" from "not found", and `process()`
   * already turns the latter into either a warning or a rethrow depending on
   * whether the caller named the set. Validating here as well only made the
   * cheap case pay for the rare one.
   *
   * @param {Object} _input - Unused
   * @returns {boolean} Always true
   */
  validate(_input) {
    return true;
  }
}

export default InstructionsStage;
