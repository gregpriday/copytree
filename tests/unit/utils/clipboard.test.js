import { execSync, spawnSync } from 'child_process';
import Clipboard from '../../../src/utils/clipboard.js';

jest.mock('child_process', () => ({
  execSync: jest.fn(),
  spawnSync: jest.fn(),
}));

// Platform switching helper
const originalPlatform = process.platform;
function setPlatform(platform) {
  Object.defineProperty(process, 'platform', { value: platform, writable: true });
}

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
});

describe('Clipboard', () => {
  describe('copyText', () => {
    it('copies text via clipboardy', async () => {
      await Clipboard.copyText('hello');
      const { default: clipboardy } = await import('clipboardy');
      expect(clipboardy.write).toHaveBeenCalledWith('hello');
      expect(clipboardy.write).toHaveBeenCalledTimes(1);
    });
  });

  describe('copyFileReference — Windows', () => {
    beforeEach(() => setPlatform('win32'));

    it('uses Base64-encoded PowerShell command via EncodedCommand', async () => {
      await Clipboard.copyFileReference('C:\\Users\\test\\output.xml');

      expect(execSync).toHaveBeenCalledTimes(1);
      const [cmd] = execSync.mock.calls[0];
      expect(cmd).toMatch(/^powershell -NoProfile -NonInteractive -EncodedCommand /);
    });

    it('uses Windows Forms SetFileDropList (no glob expansion)', async () => {
      await Clipboard.copyFileReference('C:\\Users\\test\\output.xml');

      const [cmd] = execSync.mock.calls[0];
      const base64 = cmd.split('-EncodedCommand ')[1];
      const decoded = Buffer.from(base64, 'base64').toString('utf16le');
      expect(decoded).toContain('SetFileDropList');
      expect(decoded).toContain('System.Windows.Forms');
    });

    it('escapes single quotes by doubling them', async () => {
      await Clipboard.copyFileReference("C:\\Users\\it's a test\\file.xml");

      const [cmd] = execSync.mock.calls[0];
      const base64 = cmd.split('-EncodedCommand ')[1];
      const decoded = Buffer.from(base64, 'base64').toString('utf16le');
      expect(decoded).toContain("it''s a test");
    });

    it('handles square brackets without spurious backticks (uses SetFileDropList)', async () => {
      await Clipboard.copyFileReference('C:\\Users\\test[1]\\output.xml');

      const [cmd] = execSync.mock.calls[0];
      const base64 = cmd.split('-EncodedCommand ')[1];
      const decoded = Buffer.from(base64, 'base64').toString('utf16le');
      // SetFileDropList does not glob-expand, so brackets are passed literally
      expect(decoded).toContain('test[1]');
      // No backtick escaping should be present
      expect(decoded).not.toContain('`[');
    });

    it('handles paths with dollar signs', async () => {
      await Clipboard.copyFileReference('C:\\Users\\$data\\output.xml');

      const [cmd] = execSync.mock.calls[0];
      const base64 = cmd.split('-EncodedCommand ')[1];
      const decoded = Buffer.from(base64, 'base64').toString('utf16le');
      expect(decoded).toContain('$data');
      expect(decoded).toContain('SetFileDropList');
    });

    it('handles Windows UNC paths', async () => {
      await Clipboard.copyFileReference('\\\\server\\share\\file.xml');

      const [cmd] = execSync.mock.calls[0];
      const base64 = cmd.split('-EncodedCommand ')[1];
      const decoded = Buffer.from(base64, 'base64').toString('utf16le');
      expect(decoded).toContain('\\\\server\\share\\file.xml');
    });

    it('falls back to copyText on PowerShell failure', async () => {
      execSync.mockImplementationOnce(() => {
        throw new Error('PowerShell not found');
      });
      const spy = jest.spyOn(Clipboard, 'copyText').mockResolvedValueOnce();

      await Clipboard.copyFileReference('C:\\test\\file.xml');

      expect(spy).toHaveBeenCalledWith('C:\\test\\file.xml');
      spy.mockRestore();
    });
  });

  describe('copyFileReference — macOS', () => {
    beforeEach(() => setPlatform('darwin'));

    it('uses spawnSync with osascript (no shell layer)', async () => {
      await Clipboard.copyFileReference('/Users/test/output.xml');

      expect(spawnSync).toHaveBeenCalledTimes(1);
      expect(execSync).not.toHaveBeenCalled();
      expect(spawnSync).toHaveBeenCalledWith(
        'osascript',
        ['-e', expect.stringContaining('POSIX file "/Users/test/output.xml"')],
        expect.objectContaining({ stdio: 'pipe' }),
      );
    });

    it('escapes double quotes for AppleScript', async () => {
      await Clipboard.copyFileReference('/Users/test/"quoted"/file.xml');

      const script = spawnSync.mock.calls[0][1][1];
      expect(script).toContain('\\"quoted\\"');
    });

    it('escapes backslashes for AppleScript', async () => {
      await Clipboard.copyFileReference('/Users/test\\path/file.xml');

      const script = spawnSync.mock.calls[0][1][1];
      expect(script).toContain('test\\\\path');
    });

    it('safely handles paths with single quotes (no shell injection)', async () => {
      // Previously used execSync(`osascript -e '...'`) which was vulnerable to single-quote injection.
      // Now uses spawnSync — single quotes in the path are passed verbatim to osascript.
      await Clipboard.copyFileReference("/Users/it's/file.xml");

      expect(spawnSync).toHaveBeenCalledTimes(1);
      expect(execSync).not.toHaveBeenCalled();
      const script = spawnSync.mock.calls[0][1][1];
      expect(script).toContain("it's");
    });
  });

  describe('copyFileReference — Linux', () => {
    const savedEnv = {};

    beforeEach(() => {
      setPlatform('linux');
      // Save and clear relevant env vars
      savedEnv.DISPLAY = process.env.DISPLAY;
      savedEnv.WAYLAND_DISPLAY = process.env.WAYLAND_DISPLAY;
      savedEnv.XDG_CURRENT_DESKTOP = process.env.XDG_CURRENT_DESKTOP;
      delete process.env.DISPLAY;
      delete process.env.WAYLAND_DISPLAY;
      delete process.env.XDG_CURRENT_DESKTOP;
    });

    afterEach(() => {
      // Restore env vars
      if (savedEnv.DISPLAY !== undefined) process.env.DISPLAY = savedEnv.DISPLAY;
      else delete process.env.DISPLAY;
      if (savedEnv.WAYLAND_DISPLAY !== undefined)
        process.env.WAYLAND_DISPLAY = savedEnv.WAYLAND_DISPLAY;
      else delete process.env.WAYLAND_DISPLAY;
      if (savedEnv.XDG_CURRENT_DESKTOP !== undefined)
        process.env.XDG_CURRENT_DESKTOP = savedEnv.XDG_CURRENT_DESKTOP;
      else delete process.env.XDG_CURRENT_DESKTOP;
    });

    it('X11 + GTK: uses xclip with x-special/gnome-copied-files', async () => {
      process.env.DISPLAY = ':0';
      process.env.XDG_CURRENT_DESKTOP = 'GNOME';
      spawnSync.mockReturnValueOnce({ status: 0, error: null });

      await Clipboard.copyFileReference('/home/user/file.txt');

      expect(spawnSync).toHaveBeenCalledWith(
        'xclip',
        ['-selection', 'clipboard', '-t', 'x-special/gnome-copied-files'],
        expect.objectContaining({
          input: 'copy\nfile:///home/user/file.txt',
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      );
    });

    it('X11 + KDE: uses xclip with text/uri-list', async () => {
      process.env.DISPLAY = ':0';
      process.env.XDG_CURRENT_DESKTOP = 'KDE';
      spawnSync.mockReturnValueOnce({ status: 0, error: null });

      await Clipboard.copyFileReference('/home/user/file.txt');

      expect(spawnSync).toHaveBeenCalledWith(
        'xclip',
        ['-selection', 'clipboard', '-t', 'text/uri-list'],
        expect.objectContaining({
          input: 'file:///home/user/file.txt\r\n',
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      );
    });

    it('Wayland + GTK: uses wl-copy with x-special/gnome-copied-files', async () => {
      process.env.WAYLAND_DISPLAY = 'wayland-0';
      process.env.XDG_CURRENT_DESKTOP = 'GNOME';
      spawnSync.mockReturnValueOnce({ status: 0, error: null });

      await Clipboard.copyFileReference('/home/user/file.txt');

      expect(spawnSync).toHaveBeenCalledWith(
        'wl-copy',
        ['--type', 'x-special/gnome-copied-files'],
        expect.objectContaining({
          input: 'copy\nfile:///home/user/file.txt',
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      );
    });

    it('Wayland + KDE: uses wl-copy with text/uri-list', async () => {
      process.env.WAYLAND_DISPLAY = 'wayland-0';
      process.env.XDG_CURRENT_DESKTOP = 'KDE';
      spawnSync.mockReturnValueOnce({ status: 0, error: null });

      await Clipboard.copyFileReference('/home/user/file.txt');

      expect(spawnSync).toHaveBeenCalledWith(
        'wl-copy',
        ['--type', 'text/uri-list'],
        expect.objectContaining({
          input: 'file:///home/user/file.txt\r\n',
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      );
    });

    it('no display server: falls back to plain-text URI copy', async () => {
      // Neither DISPLAY nor WAYLAND_DISPLAY set
      const spy = jest.spyOn(Clipboard, 'copyText').mockResolvedValueOnce();

      await Clipboard.copyFileReference('/home/user/file.txt');

      expect(spy).toHaveBeenCalledWith('file:///home/user/file.txt');
      expect(spawnSync).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('tool failure: falls back to plain-text URI copy', async () => {
      process.env.DISPLAY = ':0';
      process.env.XDG_CURRENT_DESKTOP = 'GNOME';
      spawnSync.mockReturnValueOnce({ status: 1, error: null });
      const spy = jest.spyOn(Clipboard, 'copyText').mockResolvedValueOnce();

      await Clipboard.copyFileReference('/home/user/file.txt');

      expect(spawnSync).toHaveBeenCalledTimes(1);
      expect(spawnSync).toHaveBeenCalledWith(
        'xclip',
        ['-selection', 'clipboard', '-t', 'x-special/gnome-copied-files'],
        expect.objectContaining({ input: 'copy\nfile:///home/user/file.txt' }),
      );
      expect(spy).toHaveBeenCalledWith('file:///home/user/file.txt');
      spy.mockRestore();
    });

    it('tool spawn error: falls back to plain-text URI copy', async () => {
      process.env.DISPLAY = ':0';
      spawnSync.mockReturnValueOnce({ status: null, error: new Error('ENOENT') });
      const spy = jest.spyOn(Clipboard, 'copyText').mockResolvedValueOnce();

      await Clipboard.copyFileReference('/home/user/file.txt');

      expect(spawnSync).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('file:///home/user/file.txt');
      spy.mockRestore();
    });

    it('spawnSync throws synchronously: falls back to plain-text URI copy', async () => {
      process.env.DISPLAY = ':0';
      spawnSync.mockImplementationOnce(() => {
        throw new Error('spawn exploded');
      });
      const spy = jest.spyOn(Clipboard, 'copyText').mockResolvedValueOnce();

      await Clipboard.copyFileReference('/home/user/file.txt');

      expect(spy).toHaveBeenCalledWith('file:///home/user/file.txt');
      spy.mockRestore();
    });

    it('URI-encodes paths with spaces correctly', async () => {
      process.env.DISPLAY = ':0';
      process.env.XDG_CURRENT_DESKTOP = 'GNOME';
      spawnSync.mockReturnValueOnce({ status: 0, error: null });

      await Clipboard.copyFileReference('/home/user/my documents/file.txt');

      expect(spawnSync).toHaveBeenCalledWith(
        'xclip',
        ['-selection', 'clipboard', '-t', 'x-special/gnome-copied-files'],
        expect.objectContaining({
          input: 'copy\nfile:///home/user/my%20documents/file.txt',
        }),
      );
    });

    it('no display server: URI-encodes spaces in fallback plain-text copy', async () => {
      const spy = jest.spyOn(Clipboard, 'copyText').mockResolvedValueOnce();

      await Clipboard.copyFileReference('/home/user/my documents/file.txt');

      expect(spy).toHaveBeenCalledWith('file:///home/user/my%20documents/file.txt');
      expect(spawnSync).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('XFCE desktop uses GTK format', async () => {
      process.env.DISPLAY = ':0';
      process.env.XDG_CURRENT_DESKTOP = 'XFCE';
      spawnSync.mockReturnValueOnce({ status: 0, error: null });

      await Clipboard.copyFileReference('/home/user/file.txt');

      expect(spawnSync).toHaveBeenCalledWith(
        'xclip',
        ['-selection', 'clipboard', '-t', 'x-special/gnome-copied-files'],
        expect.objectContaining({
          input: 'copy\nfile:///home/user/file.txt',
        }),
      );
    });

    it('Cinnamon desktop uses GTK format', async () => {
      process.env.DISPLAY = ':0';
      process.env.XDG_CURRENT_DESKTOP = 'X-Cinnamon';
      spawnSync.mockReturnValueOnce({ status: 0, error: null });

      await Clipboard.copyFileReference('/home/user/file.txt');

      expect(spawnSync).toHaveBeenCalledWith(
        'xclip',
        ['-selection', 'clipboard', '-t', 'x-special/gnome-copied-files'],
        expect.objectContaining({
          input: 'copy\nfile:///home/user/file.txt',
        }),
      );
    });

    it('unknown desktop defaults to GTK format', async () => {
      process.env.DISPLAY = ':0';
      // XDG_CURRENT_DESKTOP not set
      spawnSync.mockReturnValueOnce({ status: 0, error: null });

      await Clipboard.copyFileReference('/home/user/file.txt');

      expect(spawnSync).toHaveBeenCalledWith(
        'xclip',
        ['-selection', 'clipboard', '-t', 'x-special/gnome-copied-files'],
        expect.objectContaining({
          input: 'copy\nfile:///home/user/file.txt',
        }),
      );
    });

    it('Wayland takes priority over X11 when both are set', async () => {
      process.env.WAYLAND_DISPLAY = 'wayland-0';
      process.env.DISPLAY = ':0';
      process.env.XDG_CURRENT_DESKTOP = 'GNOME';
      spawnSync.mockReturnValueOnce({ status: 0, error: null });

      await Clipboard.copyFileReference('/home/user/file.txt');

      expect(spawnSync).toHaveBeenCalledTimes(1);
      expect(spawnSync).toHaveBeenCalledWith(
        'wl-copy',
        ['--type', 'x-special/gnome-copied-files'],
        expect.objectContaining({
          input: 'copy\nfile:///home/user/file.txt',
        }),
      );
    });
  });

  describe('_detectLinuxClipboardMethod', () => {
    const savedEnv = {};

    beforeEach(() => {
      savedEnv.DISPLAY = process.env.DISPLAY;
      savedEnv.WAYLAND_DISPLAY = process.env.WAYLAND_DISPLAY;
      savedEnv.XDG_CURRENT_DESKTOP = process.env.XDG_CURRENT_DESKTOP;
      delete process.env.DISPLAY;
      delete process.env.WAYLAND_DISPLAY;
      delete process.env.XDG_CURRENT_DESKTOP;
    });

    afterEach(() => {
      if (savedEnv.DISPLAY !== undefined) process.env.DISPLAY = savedEnv.DISPLAY;
      else delete process.env.DISPLAY;
      if (savedEnv.WAYLAND_DISPLAY !== undefined)
        process.env.WAYLAND_DISPLAY = savedEnv.WAYLAND_DISPLAY;
      else delete process.env.WAYLAND_DISPLAY;
      if (savedEnv.XDG_CURRENT_DESKTOP !== undefined)
        process.env.XDG_CURRENT_DESKTOP = savedEnv.XDG_CURRENT_DESKTOP;
      else delete process.env.XDG_CURRENT_DESKTOP;
    });

    it('returns null when no display server is available', () => {
      const result = Clipboard._detectLinuxClipboardMethod('file:///test');
      expect(result).toBeNull();
    });

    it('returns xclip config for X11', () => {
      process.env.DISPLAY = ':0';
      const result = Clipboard._detectLinuxClipboardMethod('file:///test');
      expect(result.tool).toBe('xclip');
      expect(result.args).toContain('-selection');
      expect(result.args).toContain('clipboard');
    });

    it('returns wl-copy config for Wayland', () => {
      process.env.WAYLAND_DISPLAY = 'wayland-0';
      const result = Clipboard._detectLinuxClipboardMethod('file:///test');
      expect(result.tool).toBe('wl-copy');
      expect(result.args).toContain('--type');
    });

    it('uses GTK MIME type for GNOME', () => {
      process.env.DISPLAY = ':0';
      process.env.XDG_CURRENT_DESKTOP = 'GNOME';
      const result = Clipboard._detectLinuxClipboardMethod('file:///test');
      expect(result.args).toContain('x-special/gnome-copied-files');
      expect(result.payload).toBe('copy\nfile:///test');
    });

    it('uses KDE MIME type for KDE', () => {
      process.env.DISPLAY = ':0';
      process.env.XDG_CURRENT_DESKTOP = 'KDE';
      const result = Clipboard._detectLinuxClipboardMethod('file:///test');
      expect(result.args).toContain('text/uri-list');
      expect(result.payload).toBe('file:///test\r\n');
    });

    it('is case-insensitive for KDE detection', () => {
      process.env.DISPLAY = ':0';
      process.env.XDG_CURRENT_DESKTOP = 'kde';
      const result = Clipboard._detectLinuxClipboardMethod('file:///test');
      expect(result.args).toContain('text/uri-list');
      expect(result.payload).toBe('file:///test\r\n');
    });

    it('prefers Wayland when both WAYLAND_DISPLAY and DISPLAY are set', () => {
      process.env.WAYLAND_DISPLAY = 'wayland-0';
      process.env.DISPLAY = ':0';
      const result = Clipboard._detectLinuxClipboardMethod('file:///test');
      expect(result.tool).toBe('wl-copy');
    });

    it('returns null when env vars are whitespace-only', () => {
      process.env.DISPLAY = '   ';
      process.env.WAYLAND_DISPLAY = '   ';
      const result = Clipboard._detectLinuxClipboardMethod('file:///test');
      expect(result).toBeNull();
    });
  });

  describe('revealInFinder — Windows', () => {
    beforeEach(() => setPlatform('win32'));

    it('uses spawnSync instead of execSync to avoid shell injection', async () => {
      await Clipboard.revealInFinder('C:\\Users\\test\\file.xml');

      expect(spawnSync).toHaveBeenCalledTimes(1);
      expect(execSync).not.toHaveBeenCalled();
      expect(spawnSync).toHaveBeenCalledWith('explorer', ['/select,C:\\Users\\test\\file.xml'], {
        stdio: 'pipe',
      });
    });

    it('safely handles paths with shell metacharacters', async () => {
      await Clipboard.revealInFinder('C:\\Users\\test&malicious|path\\file.xml');

      expect(spawnSync).toHaveBeenCalledWith(
        'explorer',
        ['/select,C:\\Users\\test&malicious|path\\file.xml'],
        { stdio: 'pipe' },
      );
      expect(execSync).not.toHaveBeenCalled();
    });
  });

  describe('revealInFinder — macOS', () => {
    beforeEach(() => setPlatform('darwin'));

    it('uses spawnSync with osascript (no shell layer)', async () => {
      await Clipboard.revealInFinder('/Users/test/file.xml');

      expect(spawnSync).toHaveBeenCalledTimes(1);
      expect(execSync).not.toHaveBeenCalled();
    });

    it('escapes double quotes in AppleScript', async () => {
      await Clipboard.revealInFinder('/Users/test/"quoted"/file.xml');

      const script = spawnSync.mock.calls[0][1][1];
      expect(script).toContain('\\"quoted\\"');
    });

    it('escapes backslashes in AppleScript', async () => {
      await Clipboard.revealInFinder('/Users/test\\path/file.xml');

      const script = spawnSync.mock.calls[0][1][1];
      expect(script).toContain('test\\\\path');
    });

    it('no longer has the no-op replacement bug', async () => {
      // Previously: filePath.replace(/"/g, '"') — a no-op
      // Now: filePath.replace(/"/g, '\\"') — actually escapes
      await Clipboard.revealInFinder('/Users/"test"/file.xml');

      const script = spawnSync.mock.calls[0][1][1];
      expect(script).toContain('\\"test\\"');
    });

    it('safely handles paths with single quotes (no shell injection)', async () => {
      await Clipboard.revealInFinder("/Users/it's/file.xml");

      expect(spawnSync).toHaveBeenCalledTimes(1);
      expect(execSync).not.toHaveBeenCalled();
      const script = spawnSync.mock.calls[0][1][1];
      expect(script).toContain("it's");
    });
  });

  describe('revealInFinder — Linux', () => {
    beforeEach(() => setPlatform('linux'));

    it('uses spawnSync to avoid shell injection', async () => {
      await Clipboard.revealInFinder('/home/user/dir/file.txt');

      expect(spawnSync).toHaveBeenCalledTimes(1);
      expect(execSync).not.toHaveBeenCalled();
      expect(spawnSync).toHaveBeenCalledWith('xdg-open', ['/home/user/dir'], { stdio: 'pipe' });
    });

    it('safely handles paths with $ characters (no shell expansion)', async () => {
      await Clipboard.revealInFinder('/home/$USER/project/file.txt');

      expect(spawnSync).toHaveBeenCalledWith('xdg-open', ['/home/$USER/project'], {
        stdio: 'pipe',
      });
      expect(execSync).not.toHaveBeenCalled();
    });

    it('safely handles paths with double quotes', async () => {
      await Clipboard.revealInFinder('/home/user/"weird dir"/file.txt');

      expect(spawnSync).toHaveBeenCalledWith('xdg-open', ['/home/user/"weird dir"'], {
        stdio: 'pipe',
      });
      expect(execSync).not.toHaveBeenCalled();
    });
  });
});
