const { execSync } = require('child_process');
const process = require('process');
const clipboardy = require('clipboardy').default;
const { logger } = require('./logger');

/**
 * Enhanced clipboard utilities with file reference support
 */
class Clipboard {
  /**
   * Copy text to clipboard
   * @param {string} text - The text to copy
   * @returns {Promise<void>}
   */
  static async copyText(text) {
    return await clipboardy.write(text);
  }

  /**
   * Copy file reference to clipboard (macOS only)
   * @param {string} filePath - The file path to copy as reference
   * @returns {Promise<void>}
   */
  static async copyFileReference(filePath) {
    if (process.platform !== 'darwin') {
      // Fallback to copying the file path as text on non-macOS
      return this.copyText(filePath);
    }

    try {
      // Use AppleScript to copy file reference
      const script = `
        set aFile to POSIX file "${filePath.replace(/"/g, '\\"')}"
        tell app "Finder" to set the clipboard to aFile
      `.trim();

      execSync(`osascript -e '${script}'`, { 
        encoding: 'utf8',
        stdio: 'pipe' 
      });
    } catch (error) {
      logger.debug('Failed to copy file reference, falling back to text:', error.message);
      // Fallback to copying path as text
      return this.copyText(filePath);
    }
  }

  /**
   * Reveal file in Finder (macOS only)
   * @param {string} filePath - The file path to reveal
   * @returns {Promise<void>}
   */
  static async revealInFinder(filePath) {
    if (process.platform !== 'darwin') {
      return; // Only works on macOS
    }

    try {
      const script = `
        tell application "Finder" to reveal POSIX file "${filePath.replace(/"/g, '\\"')}"
        tell application "Finder" to activate
      `.trim();

      execSync(`osascript -e '${script}'`, { 
        encoding: 'utf8',
        stdio: 'pipe' 
      });
    } catch (error) {
      logger.debug('Failed to reveal file in Finder:', error.message);
    }
  }
}

module.exports = Clipboard;