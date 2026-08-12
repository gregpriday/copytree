/**
 * The temporary reference files a default copy leaves behind.
 *
 * A reference copy hands an agent a path, so the file has to outlive the
 * process that wrote it — which means something else has to clean up. That is
 * this module, driven by `copytree cache status|gc` on a retention policy,
 * rather than the next copy deleting the file its predecessor just handed out.
 */

import path from 'path';
import fs from '../utils/fsx.js';
import { REFERENCE_ROOT } from '../utils/outputDestination.js';

/** Default retention window for reference files, in days. */
export const DEFAULT_RETENTION_DAYS = 7;

/**
 * Walk the reference directory, yielding one entry per file.
 * @returns {Promise<Array<{path: string, size: number, mtimeMs: number}>>} Entries
 */
async function listReferenceFiles() {
  if (!(await fs.pathExists(REFERENCE_ROOT))) return [];

  const files = [];
  const projects = await fs.readdir(REFERENCE_ROOT, { withFileTypes: true });

  for (const project of projects) {
    const projectDir = path.join(REFERENCE_ROOT, project.name);
    if (!project.isDirectory()) continue;

    let entries;
    try {
      entries = await fs.readdir(projectDir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const filePath = path.join(projectDir, entry);
      try {
        const stats = await fs.stat(filePath);
        if (!stats.isFile()) continue;
        files.push({ path: filePath, size: stats.size, mtimeMs: stats.mtimeMs });
      } catch {
        // Raced with a cleanup; nothing to report.
      }
    }
  }

  return files;
}

/**
 * Describe the reference files on disk.
 * @returns {Promise<{path: string, entries: number, bytes: number, oldest: string|null,
 *   newest: string|null}>} Status
 */
export async function referenceStatus() {
  const files = await listReferenceFiles();
  const times = files.map((file) => file.mtimeMs);

  return {
    path: REFERENCE_ROOT,
    entries: files.length,
    bytes: files.reduce((total, file) => total + file.size, 0),
    oldest: times.length > 0 ? new Date(Math.min(...times)).toISOString() : null,
    newest: times.length > 0 ? new Date(Math.max(...times)).toISOString() : null,
  };
}

/**
 * Remove reference files older than the retention window.
 *
 * @param {Object} [options={}] - Options
 * @param {number} [options.retentionDays=7] - Age above which a file is stale
 * @param {boolean} [options.all=false] - Remove every reference file
 * @returns {Promise<{removed: number, bytes: number}>} What was reclaimed
 */
export async function collectReferenceFiles(options = {}) {
  const retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const files = await listReferenceFiles();

  let removed = 0;
  let bytes = 0;

  for (const file of files) {
    if (!options.all && file.mtimeMs >= cutoff) continue;
    try {
      await fs.remove(file.path);
      removed += 1;
      bytes += file.size;
    } catch {
      // A file we cannot remove stays; reporting a smaller number is honest.
    }
  }

  // Leave no empty project directories behind: they are noise in a shared temp
  // directory and cost nothing to remove.
  //
  // `rmdir`, never a recursive remove. Listing a directory and then deleting it
  // recursively is two operations with a gap between them, and another process
  // writing a reference into that gap would have it deleted. `rmdir` refuses on
  // a non-empty directory, so the race resolves in favour of the new file.
  if (await fs.pathExists(REFERENCE_ROOT)) {
    for (const entry of await fs.readdir(REFERENCE_ROOT, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        await fs.rmdir(path.join(REFERENCE_ROOT, entry.name));
      } catch {
        // Not empty, or not ours to remove. Either way, leave it.
      }
    }
  }

  return { removed, bytes };
}
