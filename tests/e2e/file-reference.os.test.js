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

/**
 * Assert the reference path follows the 1.0 contract on any platform.
 *
 * `<temp>/copytree/<project-slug>/<UTC-timestamp>-<short-hash>.<ext>`. Compared
 * by path components rather than by a slash-bearing regex, so the assertion
 * means the same thing on Windows.
 *
 * @param {string} referencedPath - The path handed to the clipboard
 */
function expectReferencePath(referencedPath) {
  const parts = referencedPath.split(/[\\/]/);
  expect(parts.at(-2)).toBe('simple-project');
  expect(parts.at(-3)).toBe('copytree');
  expect(parts.at(-1)).toMatch(/^\d{4}-\d{2}-\d{2}T[\d-]+Z-[0-9a-f]{8}\.xml$/);
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
      // Reference files live under the system temp directory, which is shared
      // with every other test in the run. Giving this one its own keeps the
      // assertion about the file it wrote, not about whatever survived.
      TMPDIR: tempDir,
      TMP: tempDir,
      TEMP: tempDir,
      // The clipboard helper has a deliberately short budget so a wedged
      // Finder cannot hang a copy. On a loaded parallel run the stub is
      // occasionally killed before it writes its log, which makes this test
      // about scheduling rather than about the command it is checking.
      //
      COPYTREE_CLIPBOARD_TIMEOUT_MS: '30000',
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
      // `<temp>/copytree/<project-slug>/<UTC-timestamp>-<short-hash>.<ext>`
      expect(referencedPath).toMatch(/\/copytree\/simple-project\//);
      expect(path.basename(referencedPath)).toMatch(/^\d{4}-\d{2}-\d{2}T[\d-]+Z-[0-9a-f]{8}\.xml$/);
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
      expectReferencePath(referencedPath);
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
      expectReferencePath(referencedPath);
      expect(existsSync(referencedPath)).toBe(true);
      return;
    }

    throw new Error(`Unsupported platform for this test: ${process.platform}`);
    // Twice the clipboard budget above, deliberately. When the two were equal a
    // run that spent the whole clipboard budget failed as "Exceeded timeout of
    // 30000 ms", which says nothing about the clipboard and sends the reader
    // looking for a slow test rather than a wedged helper. Spawning a
    // freshly-written script is genuinely slow under some sandboxes and
    // security tooling, so the headroom is not theoretical.
  }, 60000);
});
