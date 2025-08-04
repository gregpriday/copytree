import { execSync } from 'child_process';
import process from 'process';
import url from 'url';
import path from 'path';
import { logger } from './logger.js';

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
    // Dynamically import ESM-only clipboardy inside async function to avoid ERR_REQUIRE_ESM in CJS
    const { default: clipboardy } = await import('clipboardy');
    return await clipboardy.write(text);
  }

  /**
   * Copy file reference to clipboard (cross-platform)
   * @param {string} filePath - The file path to copy as reference
   * @returns {Promise<void>}
   */
  static async copyFileReference(filePath) {
    if (process.platform === 'win32') {
      try {
        // Use PowerShell to copy the file reference on Windows
        const command = `powershell -Command "Set-Clipboard -Path '${filePath.replace(/'/g, '\'\'')}'"`;  
        execSync(command, { stdio: 'pipe' });
      } catch (error) {
        logger.debug('Failed to copy file reference using PowerShell, falling back to text:', error.message);
        return this.copyText(filePath);
      }
    } else if (process.platform === 'linux') {
      try {
        // Use file:// URI format for Linux clipboard compatibility
        const fileUri = url.pathToFileURL(filePath).toString();
        await this.copyText(fileUri);
      } catch (error) {
        logger.debug('Failed to copy file URI, falling back to text path:', error.message);
        return this.copyText(filePath);
      }
    } else if (process.platform === 'darwin') {
      try {
        // Use AppleScript to copy file reference
        const escapedFilePath = filePath.replace(/"/g, '"');
        const script = `
          set aFile to POSIX file "${escapedFilePath}"
          tell app "Finder" to set the clipboard to aFile
        `.trim();

        execSync(`osascript -e '${script}'`, { 
          encoding: 'utf8',
          stdio: 'pipe', 
        });
      } catch (error) {
        logger.debug('Failed to copy file reference, falling back to text:', error.message);
        // Fallback to copying path as text
        return this.copyText(filePath);
      }
    } else {
      // Fallback for other OSes
      return this.copyText(filePath);
    }
  }

  /**
   * Reveal file in file manager (cross-platform)
   * @param {string} filePath - The file path to reveal
   * @returns {Promise<void>}
   */
  static async revealInFinder(filePath) {
    if (process.platform === 'win32') {
      try {
        execSync(`explorer /select,"${filePath}"`, { stdio: 'pipe' });
      } catch (error) {
        logger.debug('Failed to reveal file in Explorer:', error.message);
      }
    } else if (process.platform === 'linux') {
      try {
        // Use xdg-open to open the parent directory
        const dir = path.dirname(filePath);
        execSync(`xdg-open "${dir}"`, { stdio: 'pipe' });
      } catch (error) {
        logger.debug('Failed to reveal file with xdg-open:', error.message);
      }
    } else if (process.platform === 'darwin') {
      try {
        const escapedFilePath = filePath.replace(/"/g, '"');
        const script = `
          tell application "Finder" to reveal POSIX file "${escapedFilePath}"
          tell application "Finder" to activate
        `.trim();

        execSync(`osascript -e '${script}'`, { 
          encoding: 'utf8',
          stdio: 'pipe', 
        });
      } catch (error) {
        logger.debug('Failed to reveal file in Finder:', error.message);
      }
    }
  }
}

export default Clipboard;
