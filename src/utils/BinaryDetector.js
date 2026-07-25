// src/utils/BinaryDetector.js
import fs from 'fs-extra';
import path from 'path';
import copytreeDefaults from '../../config/copytree.js';

/**
 * Default extension groups.
 *
 * The authoritative list lives in `config/copytree.js` under `binaryExtensions`
 * so projects can override a single group without restating the rest. This
 * import keeps the detector usable standalone (tests, direct API consumers)
 * without duplicating the list.
 */
const DEFAULT_CATEGORIES = copytreeDefaults.binaryExtensions;

/**
 * Extensions that must never be classified as binary, regardless of what a
 * user's config says. These are source-code extensions that collide with
 * binary formats (`.ts` is TypeScript far more often than MPEG transport
 * stream) and the failure mode is silent: source would vanish from every
 * context generated against the project.
 */
const NEVER_BINARY = new Set([
  '.ts',
  '.tsx',
  '.m',
  '.mm',
  '.h',
  '.hh',
  '.hpp',
  '.hxx',
  '.r',
  '.d',
  '.pl',
  '.pm',
  '.cs',
  '.rs',
  '.go',
  '.swift',
  '.kt',
  '.kts',
  '.scala',
  '.lua',
  '.sql',
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.ps1',
  '.bat',
  '.cmd',
  '.vue',
  '.svelte',
  '.astro',
  '.html',
  '.htm',
  '.svg',
  '.md',
  '.mdx',
  '.yml',
  '.yaml',
  '.toml',
  '.ini',
]);

/**
 * Magic number signatures for common binary formats.
 * Only consulted for files whose extension is unknown, so the cost is bounded
 * to files we could not classify from the path alone.
 */
const MAGIC = [
  // Images
  {
    cat: 'image',
    sig: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    ext: '.png',
    name: 'PNG',
  },
  { cat: 'image', sig: [0xff, 0xd8, 0xff], ext: '.jpg', name: 'JPEG' },
  { cat: 'image', sig: [0x47, 0x49, 0x46, 0x38], ext: '.gif', name: 'GIF' },
  { cat: 'image', sig: [0x42, 0x4d], ext: '.bmp', name: 'BMP' },
  { cat: 'image', sig: [0x00, 0x00, 0x01, 0x00], ext: '.ico', name: 'ICO' },

  // Documents
  { cat: 'document', sig: [0x25, 0x50, 0x44, 0x46, 0x2d], ext: '.pdf', name: 'PDF' }, // %PDF-
  {
    cat: 'document',
    sig: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
    ext: '.doc',
    name: 'MS Office',
  },

  // Archives
  { cat: 'archive', sig: [0x50, 0x4b, 0x03, 0x04], ext: '.zip', name: 'ZIP' },
  { cat: 'archive', sig: [0x50, 0x4b, 0x05, 0x06], ext: '.zip', name: 'ZIP (empty)' },
  { cat: 'archive', sig: [0x50, 0x4b, 0x07, 0x08], ext: '.zip', name: 'ZIP (spanned)' },
  { cat: 'archive', sig: [0x1f, 0x8b, 0x08], ext: '.gz', name: 'GZIP' },
  { cat: 'archive', sig: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], ext: '.7z', name: '7-Zip' },
  { cat: 'archive', sig: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07], ext: '.rar', name: 'RAR' },

  // Executables
  { cat: 'executable', sig: [0x7f, 0x45, 0x4c, 0x46], ext: '.elf', name: 'ELF' },
  { cat: 'executable', sig: [0x4d, 0x5a], ext: '.exe', name: 'PE/MZ' },
  {
    cat: 'executable',
    sig: [0xfe, 0xed, 0xfa, 0xce],
    ext: '.macho',
    name: 'Mach-O (32-bit BE)',
  },
  {
    cat: 'executable',
    sig: [0xfe, 0xed, 0xfa, 0xcf],
    ext: '.macho',
    name: 'Mach-O (64-bit BE)',
  },
  {
    cat: 'executable',
    sig: [0xce, 0xfa, 0xed, 0xfe],
    ext: '.macho',
    name: 'Mach-O (32-bit LE)',
  },
  {
    cat: 'executable',
    sig: [0xcf, 0xfa, 0xed, 0xfe],
    ext: '.macho',
    name: 'Mach-O (64-bit LE)',
  },
  { cat: 'executable', sig: [0xca, 0xfe, 0xba, 0xbe], ext: '.macho', name: 'Mach-O Fat Binary' },

  // Database
  {
    cat: 'database',
    sig: Array.from(Buffer.from('SQLite format 3\0')),
    ext: '.sqlite',
    name: 'SQLite',
  },
];

/**
 * Magic signatures pre-materialized as Buffers.
 *
 * `Buffer.from(sig)` inside the match loop allocated one Buffer per signature
 * per file sniffed. The signatures are constant, so they are built once.
 */
const MAGIC_BUFFERS = MAGIC.map((entry) => ({ ...entry, buf: Buffer.from(entry.sig) }));

/**
 * Printable ASCII control characters
 */
const PRINTABLE = new Set([0x09, 0x0a, 0x0d]); // tab, LF, CR

/**
 * Cache of extension -> category lookup tables, keyed by the groups object
 * identity. Config objects are long-lived, so this collapses the per-file cost
 * to a single Map hit.
 */
const lookupCache = new WeakMap();

/**
 * Build (or reuse) a flat extension -> category map from grouped extension config
 * @param {Object} groups - Category name -> array of extensions
 * @returns {Map<string, string>} Lowercased extension -> category
 */
function getLookup(groups) {
  // A caller may hand us `undefined` (config key absent) or a primitive from a
  // malformed config; neither can key a WeakMap.
  if (!groups || typeof groups !== 'object') {
    groups = DEFAULT_CATEGORIES;
  }
  if (!groups || typeof groups !== 'object') {
    return new Map();
  }

  const cached = lookupCache.get(groups);
  if (cached) return cached;

  const map = new Map();
  for (const [category, list] of Object.entries(groups)) {
    if (!Array.isArray(list)) continue;
    for (const ext of list) {
      const lower = String(ext).toLowerCase();
      if (NEVER_BINARY.has(lower)) continue;
      // First group wins, so `document` claims `.key` before `cert` only if it
      // is declared first. Order in config is meaningful and documented there.
      if (!map.has(lower)) {
        map.set(lower, category);
      }
    }
  }

  lookupCache.set(groups, map);
  return map;
}

/**
 * Categorize a file by its extension alone. No filesystem access.
 *
 * @param {string} ext - File extension (with dot)
 * @param {Object} [groups] - Grouped extension config (defaults to built-in list)
 * @returns {string|null} Category name, or null if the extension is unknown
 */
export function categorizeByExt(ext, groups = DEFAULT_CATEGORIES) {
  const lower = (ext || '').toLowerCase();
  if (!lower || NEVER_BINARY.has(lower)) return null;
  return getLookup(groups).get(lower) ?? null;
}

/**
 * Detect whether a file is binary and categorize it.
 *
 * Extension first: when the extension is known, the verdict is returned from the
 * path with no `open`, no `read`, and no `close`. A 3 GB video costs the same as
 * a 40 KB source file. Content sniffing runs only for unknown extensions.
 *
 * @param {string} filePath - Path to the file
 * @param {Object} opts - Detection options
 * @param {number} [opts.sampleBytes=8192] - Bytes to read when sniffing content
 * @param {number} [opts.nonPrintableThreshold=0.3] - Non-printable ratio that means binary
 * @param {Object} [opts.extensions] - Grouped extension config
 * @returns {Promise<Object>} Detection result with isBinary, category, reason, ext, and name
 */
export async function detect(filePath, opts = {}) {
  const sampleBytes = opts.sampleBytes ?? 8192;
  const nonPrintableThreshold = opts.nonPrintableThreshold ?? 0.3;
  const groups = opts.extensions ?? DEFAULT_CATEGORIES;

  const ext = path.extname(filePath);
  const category = categorizeByExt(ext, groups);

  // Extension is decisive. Return without touching the filesystem.
  if (category) {
    return {
      isBinary: true,
      category,
      reason: 'extension',
      ext,
    };
  }

  // Unknown extension: sniff a bounded prefix of the content.
  const buf = Buffer.alloc(sampleBytes);
  let bytesRead;
  let fd = null;

  try {
    fd = await fs.open(filePath, 'r');
    const result = await fs.read(fd, buf, 0, sampleBytes, 0);
    bytesRead = result.bytesRead;
  } catch (error) {
    // File doesn't exist or can't be read
    return {
      isBinary: false,
      category: 'text',
      reason: 'error',
      ext,
      error: error.message,
    };
  } finally {
    if (fd !== null) {
      await fs.close(fd);
    }
  }

  return classifySample(buf.subarray(0, bytesRead), ext, nonPrintableThreshold);
}

/**
 * Classify content the caller already holds in memory.
 *
 * Reading a bounded prefix to decide "is this text?" and then reading the whole
 * file to use it means every text file with an unrecognised extension is opened
 * twice. A caller that is going to read the file anyway can read it once and
 * hand the bytes here instead.
 *
 * The extension is still consulted first, so a known-binary extension is decided
 * without the caller ever having to read anything.
 *
 * @param {string} filePath - Path the bytes came from (used for its extension)
 * @param {Buffer} buffer - File content, or a prefix of it
 * @param {Object} [opts] - Detection options
 * @param {number} [opts.sampleBytes=8192] - Prefix length to examine
 * @param {number} [opts.nonPrintableThreshold=0.3] - Non-printable ratio that means binary
 * @param {Object} [opts.extensions] - Grouped extension config
 * @returns {Object} Detection result, identical in shape to {@link detect}
 */
export function detectFromBuffer(filePath, buffer, opts = {}) {
  const sampleBytes = opts.sampleBytes ?? 8192;
  const nonPrintableThreshold = opts.nonPrintableThreshold ?? 0.3;
  const groups = opts.extensions ?? DEFAULT_CATEGORIES;

  const ext = path.extname(filePath);
  const category = categorizeByExt(ext, groups);

  if (category) {
    return { isBinary: true, category, reason: 'extension', ext };
  }

  const sample = buffer.length > sampleBytes ? buffer.subarray(0, sampleBytes) : buffer;
  return classifySample(sample, ext, nonPrintableThreshold);
}

/**
 * Decide whether a byte sample is binary, by magic number then by content shape.
 *
 * @param {Buffer} sample - Bytes to examine
 * @param {string} ext - Originating file extension
 * @param {number} nonPrintableThreshold - Ratio above which content reads as binary
 * @returns {Object} Detection result
 */
function classifySample(sample, ext, nonPrintableThreshold) {
  // Magic number match
  for (const m of MAGIC_BUFFERS) {
    const sig = m.buf;
    if (sample.length >= sig.length && sample.subarray(0, sig.length).equals(sig)) {
      return {
        isBinary: true,
        category: m.cat,
        reason: 'magic',
        ext,
        name: m.name,
      };
    }
  }

  // Fallback heuristics: null byte or many non-printables. Both questions are
  // answered in one pass; scanning the sample twice doubled the work for the
  // common case, which is a text file that fails neither test.
  let nonPrintable = 0;
  for (let i = 0; i < sample.length; i++) {
    const b = sample[i];
    if (b === 0) {
      return {
        isBinary: true,
        category: 'other',
        reason: 'null-byte',
        ext,
      };
    }
    if (b >= 0x20 && b <= 0x7e) continue; // visible ASCII
    if (b >= 0x80) continue; // treat high bytes as possibly UTF-8
    if (PRINTABLE.has(b)) continue; // whitespace
    nonPrintable++;
  }

  const ratio = sample.length ? nonPrintable / sample.length : 0;

  if (ratio > nonPrintableThreshold) {
    return {
      isBinary: true,
      category: 'other',
      reason: 'ratio',
      ext,
    };
  }

  return {
    isBinary: false,
    category: 'text',
    reason: 'textual',
    ext,
  };
}

/**
 * Extensions that a document transformer can turn into text.
 * `.html`/`.htm` are deliberately absent: HTML is source code in most repos and
 * is read as text, not run through a document converter.
 */
const CONVERTIBLE_DOCUMENTS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.dot',
  '.dotx',
  '.odt',
  '.rtf',
  '.epub',
]);

/**
 * Check if a document type is convertible to text
 * @param {string} category - File category
 * @param {string} ext - File extension
 * @returns {boolean} True if the document can be converted
 */
export function isConvertibleDocument(category, ext) {
  if (category !== 'document') return false;
  return CONVERTIBLE_DOCUMENTS.has((ext || '').toLowerCase());
}

export { DEFAULT_CATEGORIES, NEVER_BINARY };
