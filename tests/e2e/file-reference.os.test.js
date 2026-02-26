/**
 * E2E Tests: OS-specific file reference clipboard behavior
 *
 * Validates that `--as-reference` uses the expected platform-specific
 * clipboard command path on the current operating system.
 */

import path from 'path';
import os from 'os';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { runCli } from './_utils.js';

const PROJECT = path.resolve(process.cwd(), 'tests/fixtures/simple-project');

function prependPath(binDir, envPath) {
  return `${binDir}${path.delimiter}${envPath || ''}`;
}

function decodePowerShellEncodedCommand(invocationLine) {
  const match = invocationLine.match(/-EncodedCommand\s+([A-Za-z0-9+/=]+)/);
  if (!match) return null;
  return Buffer.from(match[1], 'base64').toString('utf16le');
}

describe('OS-specific file reference copy', () => {
  let tempDir = null;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  test('uses platform-specific file-reference clipboard command for --as-reference', async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'copytree-file-ref-os-'));
    const binDir = path.join(tempDir, 'bin');
    const logFile = path.join(tempDir, 'clipboard-command.log');
    mkdirSync(binDir, { recursive: true });

    const env = {
      COPYTREE_TEST_LOG: logFile,
      PATH: prependPath(binDir, process.env.PATH),
    };

    if (process.platform === 'darwin') {
      const wrapper = path.join(binDir, 'osascript');
      writeFileSync(wrapper, '#!/bin/sh\nprintf "%s\\n" "$@" > "$COPYTREE_TEST_LOG"\nexit 0\n', {
        mode: 0o755,
      });

      const { code } = await runCli([PROJECT, '--as-reference', '--format', 'xml'], { env });
      expect(code).toBe(0);
      expect(existsSync(logFile)).toBe(true);

      const logged = readFileSync(logFile, 'utf8');
      expect(logged).toContain('-e');
      expect(logged).toContain('set aFile to POSIX file');
      expect(logged).toContain('tell app "Finder" to set the clipboard to aFile');

      const match = logged.match(/POSIX file "([^"]+\.xml)"/);
      expect(match).not.toBeNull();
      const referencedPath = match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      expect(path.basename(referencedPath)).toMatch(/^simple-project-\d+\.xml$/);
      expect(existsSync(referencedPath)).toBe(true);
      return;
    }

    if (process.platform === 'win32') {
      const wrapper = path.join(binDir, 'powershell.cmd');
      writeFileSync(
        wrapper,
        '@echo off\r\nsetlocal\r\necho %* > "%COPYTREE_TEST_LOG%"\r\nexit /b 0\r\n',
      );

      const { code } = await runCli([PROJECT, '--as-reference', '--format', 'xml'], { env });
      expect(code).toBe(0);
      expect(existsSync(logFile)).toBe(true);

      const invocation = readFileSync(logFile, 'utf8').trim();
      const decoded = decodePowerShellEncodedCommand(invocation);
      expect(decoded).toBeTruthy();
      expect(decoded).toContain('System.Windows.Forms');
      expect(decoded).toContain('SetFileDropList');

      const match = decoded.match(/\[void\]\$fc\.Add\('([^']+\.xml)'\)/);
      expect(match).not.toBeNull();
      const referencedPath = match[1].replace(/''/g, "'");
      expect(path.basename(referencedPath)).toMatch(/^simple-project-\d+\.xml$/);
      expect(existsSync(referencedPath)).toBe(true);
      return;
    }

    if (process.platform === 'linux') {
      const wrapper = path.join(binDir, 'xclip');
      writeFileSync(
        wrapper,
        '#!/bin/sh\n{\n  echo "ARGS:$*"\n  echo "PAYLOAD_START"\n  cat\n  echo\n  echo "PAYLOAD_END"\n} > "$COPYTREE_TEST_LOG"\nexit 0\n',
        { mode: 0o755 },
      );

      const { code } = await runCli([PROJECT, '--as-reference', '--format', 'xml'], {
        env: {
          ...env,
          DISPLAY: ':99',
          WAYLAND_DISPLAY: '',
          XDG_CURRENT_DESKTOP: 'GNOME',
        },
      });

      expect(code).toBe(0);
      expect(existsSync(logFile)).toBe(true);

      const logged = readFileSync(logFile, 'utf8');
      expect(logged).toContain('ARGS:-selection clipboard -t x-special/gnome-copied-files');

      const payloadMatch = logged.match(/PAYLOAD_START\n([\s\S]*?)\nPAYLOAD_END/);
      expect(payloadMatch).not.toBeNull();
      const payload = payloadMatch[1];
      expect(payload).toMatch(/^copy\nfile:\/\//);

      const uriMatch = payload.match(/file:\/\/[^\s]+/);
      expect(uriMatch).not.toBeNull();
      const referencedPath = fileURLToPath(uriMatch[0]);
      expect(path.basename(referencedPath)).toMatch(/^simple-project-\d+\.xml$/);
      expect(existsSync(referencedPath)).toBe(true);
      return;
    }

    throw new Error(`Unsupported platform for this test: ${process.platform}`);
  }, 30000);
});
