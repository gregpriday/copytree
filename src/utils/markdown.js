// Markdown utility helpers for CopyTree Markdown output
import path from 'path';

// Map common extensions to GitHub code fence languages
const EXT_LANG_MAP = new Map([
  // JS/TS
  ['.js', 'js'],
  ['.cjs', 'js'],
  ['.mjs', 'js'],
  ['.jsx', 'jsx'],
  ['.ts', 'ts'],
  ['.tsx', 'tsx'],
  // Data / config
  ['.json', 'json'],
  ['.yml', 'yaml'],
  ['.yaml', 'yaml'],
  // Markup & styles
  ['.md', 'markdown'],
  ['.htm', 'html'],
  ['.html', 'html'],
  ['.css', 'css'],
  ['.scss', 'scss'],
  ['.sass', 'scss'],
  // Languages
  ['.py', 'python'],
  ['.rb', 'ruby'],
  ['.java', 'java'],
  ['.go', 'go'],
  ['.rs', 'rust'],
  ['.c', 'c'],
  ['.h', 'c'],
  ['.cpp', 'cpp'],
  ['.cc', 'cpp'],
  ['.hpp', 'cpp'],
  ['.hh', 'cpp'],
  ['.sh', 'bash'],
  ['.csv', 'csv'],
  ['.txt', 'text'],
]);

function detectFenceLanguage(filePathOrExt = '') {
  const ext = filePathOrExt.startsWith('.')
    ? filePathOrExt.toLowerCase()
    : path.extname(filePathOrExt).toLowerCase();
  return EXT_LANG_MAP.get(ext) || '';
}

function chooseFence(content) {
  if (!content || typeof content !== 'string') return '```';
  const matches = content.match(/`{3,}/g);
  if (!matches) return '```';
  const maxRun = matches.reduce((max, m) => Math.max(max, m.length), 3);
  // Use a fence longer than any run found inside content
  return '`'.repeat(Math.max(4, maxRun + 1));
}

function formatTree(tree) {
  return tree || '';
}

function formatSmallMeta({ size, modified, git, binaryLabel, truncatedAt }) {
  const parts = [];
  if (typeof size === 'number') parts.push(`Size: ${size.toLocaleString()} bytes`);
  if (modified) parts.push(`Modified: ${modified}`);
  if (git) parts.push(`Git: ${git}`);
  if (binaryLabel) parts.push(`Binary: ${binaryLabel}`);
  if (typeof truncatedAt === 'number')
    parts.push(`Truncated at ${truncatedAt.toLocaleString()} chars`);
  return `<small>${parts.join(' • ')}</small>`;
}

function quoteAttrValue(value) {
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  const str = String(value).replace(/"/g, '\\"');
  return `"${str}"`;
}

function formatBeginMarker(attrs) {
  const kv = [];
  for (const [key, val] of Object.entries(attrs)) {
    if (val === undefined || val === null || val === '') continue;
    if (typeof val === 'boolean' || typeof val === 'number') {
      kv.push(`${key}=${val}`);
    } else {
      kv.push(`${key}=${quoteAttrValue(val)}`);
    }
  }
  return `<!-- copytree:file-begin ${kv.join(' ')} -->`;
}

function formatEndMarker(pathStr) {
  return `<!-- copytree:file-end path=${quoteAttrValue(pathStr)} -->`;
}

function escapeYamlScalar(s) {
  if (s === null || s === undefined) return 'null';
  const str = String(s).replace(/"/g, '\\"');
  return `"${str}"`;
}

export {
  detectFenceLanguage,
  chooseFence,
  formatBeginMarker,
  formatEndMarker,
  escapeYamlScalar,
};
