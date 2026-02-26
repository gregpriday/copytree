import { execSync, spawnSync } from 'child_process';
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
        // Use Windows Forms SetFileDropList via Base64-encoded PowerShell command.
        // This bypasses all shell quoting (Base64 encoding) and path glob expansion
        // (StringCollection is passed to SetFileDropList without any wildcard interpretation).
        // Single quotes are doubled for the PS single-quoted string literal.
        const psPath = filePath.replace(/'/g, "''");
        const psCommand = [
          'Add-Type -AssemblyName System.Windows.Forms',
          '$fc = New-Object System.Collections.Specialized.StringCollection',
          `[void]$fc.Add('${psPath}')`,
          '[System.Windows.Forms.Clipboard]::SetFileDropList($fc)',
        ].join('; ');
        const encoded = Buffer.from(psCommand, 'utf16le').toString('base64');
        execSync(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`, {
          stdio: 'pipe',
        });
      } catch (error) {
        logger.debug(
          'Failed to copy file reference using PowerShell, falling back to text:',
          error.message,
        );
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
        // Use AppleScript to copy file reference. spawnSync passes the script as a
        // direct argument (no shell), so single quotes in filePath are safe.
        const escapedFilePath = filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const script = `set aFile to POSIX file "${escapedFilePath}"
tell app "Finder" to set the clipboard to aFile`;

        spawnSync('osascript', ['-e', script], { encoding: 'utf8', stdio: 'pipe' });
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
        // Use spawnSync with array args to avoid cmd.exe interpreting &, |, <, >, ^ in paths
        spawnSync('explorer', [`/select,${filePath}`], { stdio: 'pipe' });
      } catch (error) {
        logger.debug('Failed to reveal file in Explorer:', error.message);
      }
    } else if (process.platform === 'linux') {
      try {
        // Use spawnSync with array args to avoid shell interpreting $, ", ` in paths
        const dir = path.dirname(filePath);
        spawnSync('xdg-open', [dir], { stdio: 'pipe' });
      } catch (error) {
        logger.debug('Failed to reveal file with xdg-open:', error.message);
      }
    } else if (process.platform === 'darwin') {
      try {
        // Use AppleScript to reveal file. spawnSync passes the script as a direct
        // argument (no shell), so single quotes in filePath are safe.
        const escapedFilePath = filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const script = `tell application "Finder" to reveal POSIX file "${escapedFilePath}"
tell application "Finder" to activate`;

        spawnSync('osascript', ['-e', script], { encoding: 'utf8', stdio: 'pipe' });
      } catch (error) {
        logger.debug('Failed to reveal file in Finder:', error.message);
      }
    }
  }
}

export default Clipboard;
