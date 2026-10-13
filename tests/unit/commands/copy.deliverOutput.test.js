/**
 * Reference delivery, as the command reports it.
 *
 * The clipboard layer can put a file on the clipboard, or only its path as
 * text. These run on every platform, so the classification is checked on the
 * Linux CI runners too, not only by the macOS end-to-end test.
 */

import { jest } from '@jest/globals';
import path from 'path';
import os from 'os';
import { mkdtempSync, rmSync, existsSync } from 'fs';

jest.unmock('../../../src/utils/fsx.js');

let deliverOutput;
let Clipboard;
let classifyWarnings;
let buildCompletionModel;
let WARNING_CODES;

beforeAll(async () => {
  ({ deliverOutput } = await import('../../../src/commands/copy.js'));
  ({ default: Clipboard } = await import('../../../src/utils/clipboard.js'));
  ({ classifyWarnings, buildCompletionModel, WARNING_CODES } =
    await import('../../../src/ui/feedback/model.js'));
});

describe('deliverOutput — reference destination', () => {
  let tempDir;
  let written;
  const reporter = { phase: jest.fn() };
  const request = { destination: { type: 'reference' }, content: { format: 'xml' } };

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'copytree-deliver-'));
    written = null;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    // References land under the shared temp root, in a folder named for the
    // project, which here is this test's own temp directory.
    if (written) rmSync(path.dirname(written), { recursive: true, force: true });
  });

  async function deliver() {
    const delivery = await deliverOutput({ output: '<doc/>' }, request, tempDir, reporter);
    written = delivery.path;
    return delivery;
  }

  it('reports a file reference when one was copied', async () => {
    jest.spyOn(Clipboard, 'copyFileReference').mockResolvedValue({ asText: false });

    const delivery = await deliver();

    expect(delivery).toMatchObject({ actual: 'reference', fallbackUsed: false });
    expect(existsSync(delivery.path)).toBe(true);
    expect(classifyWarnings({ stats: {} }, { delivery })).toEqual([]);
  });

  it('reports the path as text, with its cause, when no file could be copied', async () => {
    jest
      .spyOn(Clipboard, 'copyFileReference')
      .mockResolvedValue({ asText: true, cause: 'no display server detected' });

    const delivery = await deliver();

    expect(delivery).toMatchObject({
      requested: 'reference',
      actual: 'path',
      status: 'warning',
      fallbackUsed: true,
      cause: 'no display server detected',
    });
    const warnings = classifyWarnings({ stats: {} }, { delivery });
    expect(warnings.map((w) => w.code)).toEqual([WARNING_CODES.CLIPBOARD_FALLBACK]);
    const model = buildCompletionModel({ delivery, stats: { files: 1 }, warnings });
    expect(model.headline).toBe('Path copied as text, not as a file reference');
    expect(model.notes).toEqual(['no display server detected']);
  });

  it('reports the saved file when even the text copy failed', async () => {
    jest.spyOn(Clipboard, 'copyFileReference').mockRejectedValue(new Error('no clipboard'));

    const delivery = await deliver();

    expect(delivery).toMatchObject({ actual: 'file', fallbackUsed: true, cause: 'no clipboard' });
    const model = buildCompletionModel({
      delivery,
      stats: { files: 1 },
      warnings: classifyWarnings({ stats: {} }, { delivery }),
    });
    expect(model.headline).toBe(`Clipboard unavailable — output saved to ${delivery.path}`);
  });
});
