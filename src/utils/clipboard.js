import { execSync, spawnSync } from 'child_process';
import process from 'process';
import url from 'url';
import path from 'path';
import { logger } from './logger.js';

/**
 * How long to wait for the platform's clipboard helper.
 *
 * Short on purpose: a wedged helper or a headless session must not hang a copy
 * that has otherwise finished. But two seconds is a guess about someone else's
 * machine, and it is wrong on a loaded CI runner, a remote desktop session, or
 * a VM with cold page cache — where the helper is killed mid-write and the run
 * falls back to copying the path as text.
 *
 * `COPYTREE_CLIPBOARD_TIMEOUT_MS` raises it for those environments.
 *
 * @returns {number} Milliseconds
 */
function clipboardTimeout() {
  const configured = Number.parseInt(process.env.COPYTREE_CLIPBOARD_TIMEOUT_MS ?? '', 10);
  return Number.isInteger(configured) && configured > 0 ? configured : 2000;
}

/**
 * Put a file URL on the general pasteboard from osascript's own process.
 *
 * `tell app "Finder" to set the clipboard` is an Apple Event, and macOS lets it
 * through only when the terminal hosting this process declares Automation
 * access and the user has approved it. A terminal that does not declare it is
 * refused with -1743 and no prompt, so the copy degraded to text there. Writing
 * NSPasteboard through the AppKit bridge sends no Apple Event and needs no
 * consent; `writeObjects` with an NSURL publishes `public.file-url` and the
 * legacy `NSFilenamesPboardType`, which is what browsers read for a file paste.
 * The path arrives as an argument, so it needs no escaping.
 */
const MACOS_PASTEBOARD_SCRIPT = `ObjC.import('AppKit');
function run(argv) {
  const pasteboard = $.NSPasteboard.generalPasteboard;
  pasteboard.clearContents;
  if (!pasteboard.writeObjects($([$.NSURL.fileURLWithPath(argv[0])]))) {
    throw new Error('the pasteboard did not accept the file URL');
  }
}`;

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
   * Copy the path as text in place of a file reference.
   *
   * An agent can still open a pasted path, so this is a degraded success rather
   * than a failure. It is reported as one, because a browser will not attach a
   * path and "File reference copied" would send the reader to paste it there.
   *
   * @param {string} text - Path or file URI to copy
   * @param {string} cause - Why no file reference could be copied
   * @returns {Promise<{asText: true, cause: string}>} Outcome
   * @private
   */
  static async _copyAsText(text, cause) {
    await this.copyText(text);
    return { asText: true, cause };
  }

  /**
   * Copy file reference to clipboard (cross-platform)
   *
   * Falls back to the path as text when the platform cannot take a file, and
   * says so in the result; rejects only when the text copy fails too.
   *
   * @param {string} filePath - The file path to copy as reference
   * @returns {Promise<{asText: boolean, cause?: string}>} Whether a file reference
   *   was copied, or only its path as text and why
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
        return this._copyAsText(filePath, error.message);
      }
    } else if (process.platform === 'linux') {
      try {
        const fileUri = url.pathToFileURL(filePath).toString();
        const method = Clipboard._detectLinuxClipboardMethod(fileUri);

        if (!method) {
          return this._copyAsText(fileUri, 'no display server detected');
        }

        const result = spawnSync(method.tool, method.args, {
          input: method.payload,
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: clipboardTimeout(),
        });

        if (result.error || result.status !== 0) {
          logger.debug(
            `Failed to copy file reference using ${method.tool}, falling back to text:`,
            result.error?.message || `exit code ${result.status}`,
          );
          return this._copyAsText(
            fileUri,
            result.error?.message || `${method.tool} exited with code ${result.status}`,
          );
        }
      } catch (error) {
        logger.debug(
          'Failed to copy file reference on Linux, falling back to text:',
          error.message,
        );
        const fileUri = url.pathToFileURL(filePath).toString();
        return this._copyAsText(fileUri, error.message);
      }
    } else if (process.platform === 'darwin') {
      try {
        const result = spawnSync(
          'osascript',
          // `--` so a relative path starting with `-` is not read as an option.
          ['-l', 'JavaScript', '-e', MACOS_PASTEBOARD_SCRIPT, '--', filePath],
          {
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: clipboardTimeout(),
          },
        );

        // `spawnSync` does not throw when the child exits non-zero, so the
        // result had to be inspected and was not. A headless session or a
        // pasteboard that would not take the URL left no file on the clipboard
        // while the run reported "File reference copied" — the user pastes,
        // gets something else, and has no reason to suspect this command.
        if (result?.error || (result && result.status !== 0)) {
          // The first line only: the reason becomes a note under the headline.
          const reason =
            result.error?.message ||
            (result.stderr || '').trim().split('\n')[0] ||
            (result.signal
              ? `osascript was stopped by ${result.signal}`
              : `osascript exited with code ${result.status}`);
          throw new Error(reason);
        }
      } catch (error) {
        logger.debug('Failed to copy file reference, falling back to text:', error.message);
        return this._copyAsText(filePath, error.message);
      }
    } else {
      return this._copyAsText(filePath, `${process.platform} has no file-reference mechanism`);
    }
    return { asText: false };
  }

  /**
   * Whether this environment can put a real file reference on the clipboard.
   *
   * Reported rather than discovered at copy time, so `copytree doctor` can say
   * "this will paste as a path, not a file" before someone relies on it. A
   * false answer is not a failure: the copy still succeeds, and the path is
   * still on the clipboard as text.
   *
   * @returns {{supported: boolean, mechanism: string, detail: string}} Support
   */
  static supportsFileReference() {
    if (process.platform === 'darwin') {
      return {
        supported: true,
        mechanism: 'osascript',
        detail: 'NSPasteboard via osascript',
      };
    }
    if (process.platform === 'win32') {
      return { supported: true, mechanism: 'powershell', detail: 'SetFileDropList via PowerShell' };
    }
    if (process.platform === 'linux') {
      const method = Clipboard._detectLinuxClipboardMethod('file:///probe');
      return method
        ? {
            supported: true,
            mechanism: method.tool,
            detail: `${method.tool} with ${method.args.at(-1)}`,
          }
        : {
            supported: false,
            mechanism: 'text',
            detail: 'no display server detected; the path is copied as text',
          };
    }
    return {
      supported: false,
      mechanism: 'text',
      detail: `${process.platform} has no file-reference mechanism; the path is copied as text`,
    };
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
