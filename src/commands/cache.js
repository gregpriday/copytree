/**
 * `copytree cache status|clear|gc`.
 *
 * Every declared category maps to an implemented namespace. The previous
 * command declared `--gc` and `--status` and implemented neither, while its
 * handler branched on two options that were never declared at all — so the
 * flags a user could see did nothing and the code path that ran was
 * unreachable from the command line.
 */

import { config as sharedConfig } from '../config/ConfigManager.js';
import { CacheService } from '../services/CacheService.js';
import {
  DEFAULT_RETENTION_DAYS,
  collectReferenceFiles,
  referenceStatus,
} from '../services/referenceStore.js';
import { Feedback, writePayload } from '../cli/io.js';
import { formatBytes, json, table } from '../cli/render/format.js';

/** Schema identifier for cache reports. */
export const CACHE_SCHEMA = 'copytree-cache@1';

/**
 * The on-disk cache namespaces, and the prefix each one owns.
 *
 * Named here rather than inferred, because "clear the transformation cache"
 * has to mean something specific for the option to be honest. Git status is
 * deliberately absent: it is memoised for the life of one process and has no
 * on-disk namespace, so a `--git` flag could only ever have cleared nothing.
 */
const NAMESPACES = Object.freeze({
  transformations: 'copytree_transform',
});

/**
 * Run a `cache` subcommand.
 * @param {Object} request - Canonical request
 * @param {Object} [context={}] - Execution context
 * @returns {Promise<Object>} Cache model
 */
export default async function cacheCommand(request, context = {}) {
  const feedback = new Feedback({ feedback: request.feedback });
  feedback.notices(context.notices);

  const cfg = sharedConfig();
  await cfg.loadConfiguration();

  const action = request.operation.replace('cache-', '');
  const selected = selectedCategories(request.report, action);
  const cache = new CacheService();

  const model =
    action === 'status'
      ? await status(cache, selected)
      : action === 'gc'
        ? await collect(cache, selected, request.report.retentionDays ?? DEFAULT_RETENTION_DAYS)
        : await clear(cache, selected);

  feedback.detail(`Action: ${action}`);
  for (const entry of model.categories) {
    feedback.detail(`Category ${entry.category}: ${entry.location ?? `${entry.removed} removed`}`);
  }

  const text = request.report.format === 'json' ? json(model) : renderCacheText(model);
  const delivered = await writePayload(text, { output: request.report.output });
  if (delivered.destination === 'file') feedback.write(`Cache report written to ${delivered.path}`);

  return model;
}

/**
 * Which categories the options selected.
 *
 * With no category named, `status` and `gc` cover everything, and `clear` covers
 * the caches but not the reference files. A reference file is a path CopyTree
 * handed to an agent minutes ago; deleting the lot as a side effect of "clear
 * the cache" would break a read that is still in flight. `gc` removes them on a
 * retention policy, and `--references` removes them on request.
 *
 * @param {Object} report - Report options
 * @param {string} action - `status`, `clear` or `gc`
 * @returns {{transformations: boolean, git: boolean, references: boolean}} Selection
 */
function selectedCategories(report, action) {
  const named = ['transformations', 'references'].filter((name) => report[name] === true);
  if (named.length === 0) {
    return { transformations: true, references: action !== 'clear' };
  }
  return {
    transformations: named.includes('transformations'),
    references: named.includes('references'),
  };
}

/**
 * Report what is cached.
 * @param {CacheService} cache - Cache service
 * @param {Object} selected - Selected categories
 * @returns {Promise<Object>} Status model
 */
async function status(cache, selected) {
  const entries = [];

  if (selected.transformations) {
    const cacheStatus = await cache.status();
    entries.push({
      category: 'transformations',
      location: cacheStatus.path,
      enabled: cacheStatus.enabled,
      entries: cacheStatus.entries,
      bytes: cacheStatus.bytes,
      oldest: cacheStatus.oldest,
      newest: cacheStatus.newest,
    });
  }

  if (selected.references) {
    const refs = await referenceStatus();
    entries.push({
      category: 'references',
      location: refs.path,
      enabled: true,
      entries: refs.entries,
      bytes: refs.bytes,
      oldest: refs.oldest,
      newest: refs.newest,
    });
  }

  return { schema: CACHE_SCHEMA, action: 'status', categories: entries };
}

/**
 * Remove cached entries.
 * @param {CacheService} cache - Cache service
 * @param {Object} selected - Selected categories
 * @returns {Promise<Object>} Clear model
 */
async function clear(cache, selected) {
  const results = [];

  for (const [name] of Object.entries(NAMESPACES)) {
    if (!selected[name]) continue;
    results.push({ category: name, removed: await cache.clear(), bytes: null });
  }

  if (selected.references) {
    const reclaimed = await collectReferenceFiles({ all: true });
    results.push({ category: 'references', removed: reclaimed.removed, bytes: reclaimed.bytes });
  }

  return { schema: CACHE_SCHEMA, action: 'clear', categories: results };
}

/**
 * Remove expired entries and stale reference files.
 * @param {CacheService} cache - Cache service
 * @param {Object} selected - Selected categories
 * @param {number} retentionDays - Reference retention window
 * @returns {Promise<Object>} GC model
 */
async function collect(cache, selected, retentionDays) {
  const results = [];

  if (selected.transformations) {
    results.push({
      category: 'transformations',
      removed: await cache.runGarbageCollection(),
      bytes: null,
    });
  }

  if (selected.references) {
    const reclaimed = await collectReferenceFiles({ retentionDays });
    results.push({
      category: 'references',
      removed: reclaimed.removed,
      bytes: reclaimed.bytes,
      retentionDays,
    });
  }

  return { schema: CACHE_SCHEMA, action: 'gc', categories: results, retentionDays };
}

/**
 * Render a cache report as text.
 * @param {Object} model - Cache model
 * @returns {string} Report text
 */
function renderCacheText(model) {
  if (model.action === 'status') {
    return `${[
      'Cache status',
      '',
      ...table(
        [
          { key: 'category', label: 'Category' },
          { key: 'entries', label: 'Entries', align: 'right' },
          { key: 'bytes', label: 'Bytes', align: 'right' },
          { key: 'oldest', label: 'Oldest' },
          { key: 'newest', label: 'Newest' },
          { key: 'location', label: 'Location' },
        ],
        model.categories.map((entry) => ({
          category: entry.category,
          entries: String(entry.entries),
          bytes: formatBytes(entry.bytes),
          oldest: entry.oldest ?? '-',
          newest: entry.newest ?? '-',
          location: entry.location,
        })),
      ),
    ].join('\n')}\n`;
  }

  const verb = model.action === 'gc' ? 'Collected' : 'Cleared';
  const lines = model.categories.map((entry) => {
    const bytes = entry.bytes === null ? '' : ` (${formatBytes(entry.bytes)})`;
    return `${verb} ${entry.removed} ${entry.category} entr${entry.removed === 1 ? 'y' : 'ies'}${bytes}`;
  });
  if (model.action === 'gc') {
    lines.push(`Reference retention: ${model.retentionDays} days`);
  }
  return `${lines.join('\n')}\n`;
}
