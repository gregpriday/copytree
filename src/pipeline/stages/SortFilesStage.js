import Stage from '../Stage.js';
import path from 'path';

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

    // Create a copy to avoid mutating the original array
    const sorted = [...files].sort((a, b) => {
      let compareValue = 0;

      switch (this.sortBy) {
      case 'size':
        compareValue = this.compareBySize(a, b);
        break;

      case 'modified':
        compareValue = this.compareByModified(a, b);
        break;

      case 'name':
        compareValue = this.compareByName(a, b);
        break;

      case 'extension':
        compareValue = this.compareByExtension(a, b);
        break;

      case 'depth':
        compareValue = this.compareByDepth(a, b);
        break;

      case 'path':
      default:
        compareValue = this.compareByPath(a, b);
        break;
      }

      // Apply sort order
      return this.order === 'desc' ? -compareValue : compareValue;
    });

    const elapsed = this.getElapsedTime(startTime);
    this.log(`Files sorted in ${elapsed}`, 'info');

    return {
      ...input,
      files: sorted,
    };
  }

  /**
   * Compare by file path (alphabetical)
   */
  compareByPath(a, b) {
    return a.relativePath.localeCompare(b.relativePath, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  }

  /**
   * Compare by file size
   */
  compareBySize(a, b) {
    const sizeA = a.stats?.size || 0;
    const sizeB = b.stats?.size || 0;

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
    const timeA = a.stats?.mtime ? new Date(a.stats.mtime).getTime() : 0;
    const timeB = b.stats?.mtime ? new Date(b.stats.mtime).getTime() : 0;

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
    const nameA = path.basename(a.relativePath);
    const nameB = path.basename(b.relativePath);

    return nameA.localeCompare(nameB, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  }

  /**
   * Compare by file extension
   */
  compareByExtension(a, b) {
    const extA = path.extname(a.relativePath).toLowerCase();
    const extB = path.extname(b.relativePath).toLowerCase();

    if (extA === extB) {
      // Secondary sort by path if extensions are equal
      return this.compareByPath(a, b);
    }

    return extA.localeCompare(extB);
  }

  /**
   * Compare by directory depth
   */
  compareByDepth(a, b) {
    const depthA = a.relativePath.split(path.sep).length;
    const depthB = b.relativePath.split(path.sep).length;

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
