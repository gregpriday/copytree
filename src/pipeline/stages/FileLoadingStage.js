import Stage from '../Stage.js';
import fs from 'fs-extra';
import path from 'path';
import { detect, isConvertibleDocument } from '../../utils/BinaryDetector.js';

class FileLoadingStage extends Stage {
  constructor(options = {}) {
    super(options);
    this.encoding = options.encoding || 'utf8';
    this.binaryAction = this.config.get('copytree.binaryFileAction', 'placeholder');
  }

  async process(input) {
    this.log(`Loading content for ${input.files.length} files`, 'debug');
    const startTime = Date.now();

    const filesWithContent = await Promise.all(
      input.files.map((file) => this.loadFileContent(file)),
    );

    this.log(`Loaded file contents in ${this.getElapsedTime(startTime)}`, 'info');

    return {
      ...input,
      files: filesWithContent,
    };
  }

  async loadFileContent(file) {
    try {
      // Use centralized binary detector
      const det = await detect(file.absolutePath, {
        sampleBytes: this.config.get('copytree.binaryDetect.sampleBytes', 8192),
        nonPrintableThreshold: this.config.get('copytree.binaryDetect.nonPrintableThreshold', 0.3),
      });

      // Get policy for this file's category
      const policy =
        this.config.get('copytree.binaryPolicy', {})[det.category] || this.binaryAction;

      // Handle convertible documents - load raw bytes so transformers can convert
      if (det.isBinary && isConvertibleDocument(det.category, det.ext) && policy === 'convert') {
        const content = await fs.readFile(file.absolutePath); // Buffer
        return {
          ...file,
          content,
          isBinary: true,
          encoding: undefined,
          binaryCategory: det.category,
          binaryName: det.name,
        };
      }

      // Handle non-convertible binaries
      if (det.isBinary) {
        return this.handleBinaryFile(file, det, policy);
      }

      // Regular text file
      const content = await fs.readFile(file.absolutePath, this.encoding);

      return {
        ...file,
        content,
        isBinary: false,
        encoding: this.encoding,
      };
    } catch (error) {
      this.log(`Error loading ${file.path}: ${error.message}`, 'warn');

      return {
        ...file,
        content: `[Error loading file: ${error.message}]`,
        error: error.message,
        isBinary: false,
      };
    }
  }

  handleBinaryFile(file, det, policy) {
    switch (policy) {
      case 'skip':
        return null;

      case 'comment':
        // Return stub for formatters to emit comments
        return {
          ...file,
          content: '',
          isBinary: true,
          excluded: true,
          excludedReason: det.category || 'binary',
          binaryCategory: det.category,
          binaryName: det.name,
        };

      case 'base64':
        return this.loadBinaryAsBase64(file, det);

      case 'placeholder':
      default:
        return {
          ...file,
          content: this.config.get('copytree.binaryPlaceholderText', '[Binary file not included]'),
          isBinary: true,
          binaryCategory: det.category,
          binaryName: det.name,
        };
    }
  }

  async loadBinaryAsBase64(file, det) {
    try {
      const buffer = await fs.readFile(file.absolutePath);
      const base64 = buffer.toString('base64');

      return {
        ...file,
        content: base64,
        isBinary: true,
        encoding: 'base64',
        binaryCategory: det?.category,
        binaryName: det?.name,
      };
    } catch (error) {
      return {
        ...file,
        content: `[Error loading binary file: ${error.message}]`,
        error: error.message,
        isBinary: true,
        binaryCategory: det?.category,
        binaryName: det?.name,
      };
    }
  }
}

export default FileLoadingStage;
