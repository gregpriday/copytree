// src/utils/BinaryDetector.js
import fs from 'fs-extra';
import path from 'path';

/**
 * File categories for binary detection and policy application
 */
const CATEGORIES = {
  image: [
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.bmp',
    '.webp',
    '.ico',
    '.tif',
    '.tiff',
    '.psd',
    '.heic',
  ],
  media: ['.mp3', '.aac', '.wav', '.flac', '.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.flv'],
  archive: ['.zip', '.7z', '.rar', '.tar', '.gz', '.bz2', '.xz', '.lz', '.tgz'],
  exec: ['.exe', '.dll', '.so', '.dylib', '.a', '.o', '.class', '.jar', '.war', '.app'],
  font: ['.ttf', '.otf', '.woff', '.woff2', '.eot'],
  database: ['.sqlite', '.sqlite3', '.db', '.mdb', '.accdb', '.dbf'],
  cert: ['.pem', '.der', '.crt', '.cer', '.p12', '.pfx', '.key'],
  document: ['.pdf', '.doc', '.docx', '.odt', '.rtf', '.epub', '.html', '.htm'],
  other: ['.bin', '.dat'],
};

/**
 * Magic number signatures for common binary formats
 * Each entry has: category, signature bytes, and detected extension
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
  { cat: 'exec', sig: [0x7f, 0x45, 0x4c, 0x46], ext: '.elf', name: 'ELF' }, // ELF
  { cat: 'exec', sig: [0x4d, 0x5a], ext: '.exe', name: 'PE/MZ' }, // MZ (PE)
  {
    cat: 'exec',
    sig: [0xfe, 0xed, 0xfa, 0xce],
    ext: '.macho',
    name: 'Mach-O (32-bit BE)',
  },
  {
    cat: 'exec',
    sig: [0xfe, 0xed, 0xfa, 0xcf],
    ext: '.macho',
    name: 'Mach-O (64-bit BE)',
  },
  {
    cat: 'exec',
    sig: [0xce, 0xfa, 0xed, 0xfe],
    ext: '.macho',
    name: 'Mach-O (32-bit LE)',
  },
  {
    cat: 'exec',
    sig: [0xcf, 0xfa, 0xed, 0xfe],
    ext: '.macho',
    name: 'Mach-O (64-bit LE)',
  },
  { cat: 'exec', sig: [0xca, 0xfe, 0xba, 0xbe], ext: '.macho', name: 'Mach-O Fat Binary' },

  // Database
  {
    cat: 'database',
    sig: Array.from(Buffer.from('SQLite format 3\0')),
    ext: '.sqlite',
    name: 'SQLite',
  },
];

/**
 * Printable ASCII control characters
 */
const PRINTABLE = new Set([0x09, 0x0a, 0x0d]); // tab, LF, CR

/**
 * Categorize a file by its extension
 * @param {string} ext - File extension (with dot)
 * @returns {string|null} Category name or null
 */
function categorizeByExt(ext) {
  const lower = (ext || '').toLowerCase();
  for (const [cat, list] of Object.entries(CATEGORIES)) {
    if (list.includes(lower)) return cat;
  }
  return null;
}

/**
 * Detect if a file is binary and categorize it
 * @param {string} filePath - Path to the file
 * @param {Object} opts - Detection options
 * @param {number} opts.sampleBytes - Number of bytes to read for detection
 * @param {number} opts.nonPrintableThreshold - Ratio threshold for binary detection
 * @returns {Promise<Object>} Detection result with isBinary, category, reason, ext, and name
 */
export async function detect(filePath, opts = {}) {
  const sampleBytes = opts.sampleBytes ?? 8192;
  const nonPrintableThreshold = opts.nonPrintableThreshold ?? 0.3;

  const ext = path.extname(filePath);
  let category = categorizeByExt(ext);

  let buf;
  try {
    buf = await fs.readFile(filePath);
  } catch (error) {
    // File doesn't exist or can't be read
    return {
      isBinary: false,
      category: 'text',
      reason: 'error',
      ext,
      error: error.message,
    };
  }

  const sample = buf.subarray(0, Math.min(sampleBytes, buf.length));

  // Magic number match
  for (const m of MAGIC) {
    const sig = Buffer.from(m.sig);
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

  // Fallback heuristics: null byte or many non-printables
  if (sample.some((b) => b === 0)) {
    return {
      isBinary: true,
      category: category || 'other',
      reason: 'null-byte',
      ext,
    };
  }

  let nonPrintable = 0;
  for (const b of sample) {
    if (b >= 0x20 && b <= 0x7e) continue; // visible ASCII
    if (b >= 0x80) continue; // treat high bytes as possibly UTF-8
    if (PRINTABLE.has(b)) continue; // whitespace
    nonPrintable++;
  }
  const ratio = sample.length ? nonPrintable / sample.length : 0;

  if (category || ratio > nonPrintableThreshold) {
    return {
      isBinary: true,
      category: category || 'other',
      reason: category ? 'extension' : 'ratio',
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
 * Check if a document type is convertible to text
 * @param {string} category - File category
 * @param {string} ext - File extension
 * @returns {boolean} True if the document can be converted
 */
export function isConvertibleDocument(category, ext) {
  if (category !== 'document') return false;
  return ['.pdf', '.doc', '.docx', '.odt', '.rtf', '.epub', '.html', '.htm'].includes(
    (ext || '').toLowerCase(),
  );
}

