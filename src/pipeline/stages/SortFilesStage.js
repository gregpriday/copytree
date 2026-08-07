import Stage from '../Stage.js';
import path from 'path';
import {
  comparatorFor as stringComparatorFor,
  compareCollated,
  comparePlain,
} from '../../utils/collation.js';

/**
 * Path and name ordering.
 *
 * `String.prototype.localeCompare(other, undefined, options)` has to construct a
 * collator from those options on every call, and this comparator runs O(n log n)
 * times: sorting 50,000 paths took roughly 1.2 s that way.
 *
 * `compareCollated` reproduces `Intl.Collator('en', {numeric: true, sensitivity:
 * 'base'})` from a frozen weight table for printable ASCII, and defers to a real
 * collator for anything else. See `src/utils/collation.js` for why the table is
 * frozen rather than derived, and for the equivalence testing behind it.
 */

/**
 * Total, locale-independent ordering of two strings by UTF-16 code unit.
 *
 * Used only to break ties the collator reports as equal. `sensitivity: 'base'`
 * calls `README.md` and `readme.md` equal, and a tie leaves the winner to
 * whatever order the array already had — which traces back to filesystem
 * enumeration. That is exactly the nondeterminism a pinned locale was meant to
 * remove.
 *
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Negative, zero, or positive
 */
function compareCodeUnits(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Read a file's comparable path.
 * @param {Object} file - File entry
 * @returns {string} Relative path
 */
function pathOf(file) {
  return file.relativePath || file.path || '';
}

/**
 * Count path segments without allocating the split array.
 * @param {string} value - POSIX path
 * @returns {number} Segment count, matching `split('/').length`
 */
function countSegments(value) {
  let count = 1;
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) === 47) count++;
  }
  return count;
}

/**
 * Sort files stage - Sort files by various criteria
 */
class SortFilesStage extends Stage {
  constructor(sortBy = 'path', order = 'asc') {
    // Handle options object from Pipeline (new architecture)
    if (typeof sortBy === 'object' && sortBy !== null) {
      const options = sortBy;
      super(options);
      this.sortBy = options.sortBy || 'path';
      this.order = options.order || 'asc';
    } else {
      // Handle individual parameters (legacy)
      super();
      this.sortBy = sortBy; // 'path', 'size', 'modified', 'name', 'extension'
      this.order = order; // 'asc' or 'desc'
    }

    // `process()` narrows this to the ASCII comparator once it has seen the
    // paths. The general form is the default so a comparator called directly —
    // by a test, or by another stage — still handles any alphabet.
    this._compareStrings = compareCollated;
  }

  /**
   * Process and sort files
   */
  async process(input) {
    const { files } = input;

    if (!files || files.length === 0) {
      return input;
    }

    const startTime = Date.now();
    this.log(`Sorting ${files.length} files by ${this.sortBy} (${this.order})`, 'info');

    // Which string comparator to use is settled once, by scanning the paths
    // for anything outside printable ASCII. Asking per comparison meant an O(n)
    // alphabet scan inside a function called O(n log n) times, which cost more
    // than the comparison it was guarding.
    this._compareStrings = stringComparatorFor(files.map((file) => pathOf(file)));

    // Resolve the comparator and the direction once rather than re-running the
    // switch and the string equality inside every comparison.
    const compare = this.comparatorFor(this.sortBy);
    const descending = this.order === 'desc';

    // Create a copy to avoid mutating the original array
    const sorted = [...files].sort(descending ? (a, b) => -compare(a, b) : (a, b) => compare(a, b));

    const elapsed = this.getElapsedTime(startTime);
    this.log(`Files sorted in ${elapsed}`, 'info');

    return {
      ...input,
      files: sorted,
    };
  }

  /**
   * Handle errors during sorting - return unsorted files
   */
  async handleError(error, input) {
    this.log(`Sorting failed: ${error.message}, returning files unsorted`, 'warn');
    // Return input unchanged if sorting fails
    return input;
  }

  /**
   * Resolve the comparison function for a sort key.
   * @param {string} sortBy - Sort key
   * @returns {(a: Object, b: Object) => number} Comparator
   */
  comparatorFor(sortBy) {
    switch (sortBy) {
      case 'size':
        return (a, b) => this.compareBySize(a, b);
      case 'modified':
        return (a, b) => this.compareByModified(a, b);
      case 'name':
        return (a, b) => this.compareByName(a, b);
      case 'extension':
        return (a, b) => this.compareByExtension(a, b);
      case 'depth':
        return (a, b) => this.compareByDepth(a, b);
      case 'path':
      default:
        return (a, b) => this.compareByPath(a, b);
    }
  }

  /**
   * Compare by file path (alphabetical).
   *
   * This is the terminal comparator every other sort key falls back to, so it
   * has to be a total order: anything it leaves tied is resolved by array
   * position, which is filesystem order.
   */
  compareByPath(a, b) {
    const pathA = pathOf(a);
    const pathB = pathOf(b);
    const collated = this._compareStrings(pathA, pathB);
    return collated !== 0 ? collated : compareCodeUnits(pathA, pathB);
  }

  /**
   * Compare by file size
   */
  compareBySize(a, b) {
    // `size` is the documented field on a file result; `stats` is the raw
    // fs.Stats that only survives while a file is still inside the pipeline.
    // Reading only the latter sorted every SDK-shaped file as size 0.
    const sizeA = a.size ?? a.stats?.size ?? 0;
    const sizeB = b.size ?? b.stats?.size ?? 0;

    if (sizeA === sizeB) {
      // Secondary sort by path if sizes are equal
      return this.compareByPath(a, b);
    }

    return sizeA - sizeB;
  }

  /**
   * Compare by modification time
   */
  compareByModified(a, b) {
    const rawA = a.modified ?? a.stats?.mtime;
    const rawB = b.modified ?? b.stats?.mtime;
    const timeA = rawA ? new Date(rawA).getTime() : 0;
    const timeB = rawB ? new Date(rawB).getTime() : 0;

    if (timeA === timeB) {
      // Secondary sort by path if times are equal
      return this.compareByPath(a, b);
    }

    return timeA - timeB;
  }

  /**
   * Compare by file name only (not full path)
   */
  compareByName(a, b) {
    const nameCompare = this._compareStrings(path.basename(pathOf(a)), path.basename(pathOf(b)));
    // Same basename in two directories is the common case here, not an edge
    // case: without the fallback, every `index.js` in the tree ties.
    return nameCompare !== 0 ? nameCompare : this.compareByPath(a, b);
  }

  /**
   * Compare by file extension
   */
  compareByExtension(a, b) {
    const extA = path.extname(pathOf(a)).toLowerCase();
    const extB = path.extname(pathOf(b)).toLowerCase();

    if (extA === extB) {
      // Secondary sort by path if extensions are equal
      return this.compareByPath(a, b);
    }

    return comparePlain(extA, extB);
  }

  /**
   * Compare by directory depth
   */
  compareByDepth(a, b) {
    const depthA = countSegments(pathOf(a));
    const depthB = countSegments(pathOf(b));

    if (depthA === depthB) {
      // Secondary sort by path if depths are equal
      return this.compareByPath(a, b);
    }

    return depthA - depthB;
  }

  /**
   * Validate input
   */
  validate(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('Input must be an object');
    }

    if (!Array.isArray(input.files)) {
      throw new Error('Input must have a files array');
    }

    const validSortOptions = ['path', 'size', 'modified', 'name', 'extension', 'depth'];
    if (!validSortOptions.includes(this.sortBy)) {
      throw new Error(
        `Invalid sortBy option: ${this.sortBy}. Must be one of: ${validSortOptions.join(', ')}`,
      );
    }

    const validOrderOptions = ['asc', 'desc'];
    if (!validOrderOptions.includes(this.order)) {
      throw new Error(
        `Invalid order option: ${this.order}. Must be one of: ${validOrderOptions.join(', ')}`,
      );
    }

    return true;
  }
}

export default SortFilesStage;
