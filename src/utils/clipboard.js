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
        const fileUri = url.pathToFileURL(filePath).toString();
        const method = Clipboard._detectLinuxClipboardMethod(fileUri);

        if (!method) {
          // Neither xclip nor wl-copy available; fall back to plain-text URI
          return this.copyText(fileUri);
        }

        const result = spawnSync(method.tool, method.args, {
          input: method.payload,
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 2000,
        });

        if (result.error || result.status !== 0) {
          logger.debug(
            `Failed to copy file reference using ${method.tool}, falling back to text:`,
            result.error?.message || `exit code ${result.status}`,
          );
          return this.copyText(fileUri);
        }
      } catch (error) {
        logger.debug(
          'Failed to copy file reference on Linux, falling back to text:',
          error.message,
        );
        const fileUri = url.pathToFileURL(filePath).toString();
        return this.copyText(fileUri);
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
   * Detect the correct Linux clipboard tool, MIME type, and payload for file references.
   *
   * Desktop environment detection:
   * - GTK-based (GNOME, XFCE, Cinnamon, MATE, Budgie): uses `x-special/gnome-copied-files`
   * - KDE/Qt: uses `text/uri-list`
   * - Unknown: defaults to GTK format (more widely supported)
   *
   * Display protocol detection:
   * - Wayland ($WAYLAND_DISPLAY set): uses `wl-copy`
   * - X11 ($DISPLAY set): uses `xclip`
   * - Neither: returns null (no clipboard tool available)
   *
   * @param {string} fileUri - The file:// URI to place on the clipboard
   * @returns {{ tool: string, args: string[], payload: string } | null}
   * @private
   */
  static _detectLinuxClipboardMethod(fileUri) {
    const desktop = (process.env.XDG_CURRENT_DESKTOP || '').toUpperCase();
    const isKDE = desktop.includes('KDE');

    // Determine MIME type and payload based on desktop environment
    let mimeType;
    let payload;
    if (isKDE) {
      mimeType = 'text/uri-list';
      payload = `${fileUri}\r\n`;
    } else {
      // GTK-based desktops (GNOME, XFCE, Cinnamon, MATE, Budgie) and unknown DEs
      mimeType = 'x-special/gnome-copied-files';
      payload = `copy\n${fileUri}`;
    }

    // Determine clipboard tool based on display protocol
    if ((process.env.WAYLAND_DISPLAY || '').trim()) {
      return {
        tool: 'wl-copy',
        args: ['--type', mimeType],
        payload,
      };
    }

    if ((process.env.DISPLAY || '').trim()) {
      return {
        tool: 'xclip',
        args: ['-selection', 'clipboard', '-t', mimeType],
        payload,
      };
    }

    // No display server detected
    return null;
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
