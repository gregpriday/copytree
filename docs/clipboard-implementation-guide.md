# Clipboard Implementation Guide for CopyTree Node.js

This guide explains how to implement clipboard functionality in the Node.js version of CopyTree, including both text content and file reference copying, migrating from the PHP implementation that uses custom pbcopy calls.

## Overview

The PHP version uses:
- Direct `pbcopy` command for text content
- AppleScript via `osascript` for file references (with `-r` flag)
- macOS-only implementation with no cross-platform fallbacks

The Node.js version will use:
- `clipboardy` for cross-platform text clipboard operations
- Custom child_process implementation for file references on macOS
- Platform-specific implementations for file reference support

## Understanding the Limitations

### Clipboardy Limitations
- **Text-only**: Clipboardy only supports plain text, not file references
- **No binary data**: Cannot handle images or other binary clipboard formats
- **Single format**: Cannot provide multiple clipboard formats simultaneously

### File Reference Challenge
When you copy a file in Finder, it doesn't copy the file's contents but rather a reference that allows:
- Pasting the actual file in another location
- Moving/copying files between directories
- Different behavior than text content copying

## Implementation Strategy

### 1. Basic Clipboard Class Structure

```javascript
const clipboardy = require('clipboardy');
const { exec, execSync } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

class Clipboard {
  constructor() {
    this.platform = os.platform();
    this.isMacOS = this.platform === 'darwin';
    this.isWindows = this.platform === 'win32';
    this.isLinux = this.platform === 'linux';
  }

  /**
   * Copy text content to clipboard (cross-platform)
   */
  async copyText(content) {
    try {
      await clipboardy.write(content);
      return true;
    } catch (error) {
      throw new Error(`Failed to copy text to clipboard: ${error.message}`);
    }
  }

  /**
   * Copy text content to clipboard (synchronous)
   */
  copyTextSync(content) {
    try {
      clipboardy.writeSync(content);
      return true;
    } catch (error) {
      throw new Error(`Failed to copy text to clipboard: ${error.message}`);
    }
  }

  /**
   * Copy file reference to clipboard (platform-specific)
   */
  async copyFileReference(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const absolutePath = path.resolve(filePath);

    if (this.isMacOS) {
      return this.copyFileReferenceMacOS(absolutePath);
    } else if (this.isWindows) {
      return this.copyFileReferenceWindows(absolutePath);
    } else {
      throw new Error('File reference copying is not supported on Linux');
    }
  }

  /**
   * Copy file reference on macOS using AppleScript
   */
  async copyFileReferenceMacOS(filePath) {
    return new Promise((resolve, reject) => {
      // Escape quotes in file path for AppleScript
      const escapedPath = filePath.replace(/"/g, '\\"');
      
      const appleScript = `
        set aFile to POSIX file "${escapedPath}"
        tell application "Finder"
          set the clipboard to aFile
        end tell
      `;

      exec(`osascript -e '${appleScript}'`, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Failed to copy file reference: ${error.message}`));
        } else {
          resolve(true);
        }
      });
    });
  }

  /**
   * Copy file reference on Windows using PowerShell
   */
  async copyFileReferenceWindows(filePath) {
    return new Promise((resolve, reject) => {
      // PowerShell script to copy file to clipboard
      const psScript = `
        Add-Type -AssemblyName System.Windows.Forms
        $files = [System.Collections.Specialized.StringCollection]::new()
        $files.Add("${filePath.replace(/"/g, '`"')}")
        [System.Windows.Forms.Clipboard]::SetFileDropList($files)
      `;

      exec(`powershell -command "${psScript}"`, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Failed to copy file reference: ${error.message}`));
        } else {
          resolve(true);
        }
      });
    });
  }

  /**
   * Check if platform supports file reference copying
   */
  supportsFileReferences() {
    return this.isMacOS || this.isWindows;
  }
}

module.exports = Clipboard;
```

### 2. Enhanced Implementation with Multiple Files

```javascript
class EnhancedClipboard extends Clipboard {
  /**
   * Copy multiple file references to clipboard
   */
  async copyFileReferences(filePaths) {
    // Validate all files exist
    const absolutePaths = filePaths.map(fp => {
      if (!fs.existsSync(fp)) {
        throw new Error(`File not found: ${fp}`);
      }
      return path.resolve(fp);
    });

    if (this.isMacOS) {
      return this.copyFileReferencesMacOS(absolutePaths);
    } else if (this.isWindows) {
      return this.copyFileReferencesWindows(absolutePaths);
    } else {
      throw new Error('File reference copying is not supported on Linux');
    }
  }

  /**
   * Copy multiple files on macOS
   */
  async copyFileReferencesMacOS(filePaths) {
    return new Promise((resolve, reject) => {
      const fileList = filePaths
        .map(fp => `POSIX file "${fp.replace(/"/g, '\\"')}"`)
        .join(', ');
      
      const appleScript = `
        set fileList to {${fileList}}
        tell application "Finder"
          set the clipboard to fileList
        end tell
      `;

      exec(`osascript -e '${appleScript}'`, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Failed to copy file references: ${error.message}`));
        } else {
          resolve(true);
        }
      });
    });
  }

  /**
   * Copy multiple files on Windows
   */
  async copyFileReferencesWindows(filePaths) {
    return new Promise((resolve, reject) => {
      const fileAddCommands = filePaths
        .map(fp => `$files.Add("${fp.replace(/"/g, '`"')}")`)
        .join('\n        ');
      
      const psScript = `
        Add-Type -AssemblyName System.Windows.Forms
        $files = [System.Collections.Specialized.StringCollection]::new()
        ${fileAddCommands}
        [System.Windows.Forms.Clipboard]::SetFileDropList($files)
      `;

      exec(`powershell -command "${psScript}"`, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Failed to copy file references: ${error.message}`));
        } else {
          resolve(true);
        }
      });
    });
  }

  /**
   * Reveal file in Finder/Explorer (like PHP version)
   */
  async revealFile(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const absolutePath = path.resolve(filePath);

    if (this.isMacOS) {
      return new Promise((resolve, reject) => {
        exec(`open -R "${absolutePath}"`, (error) => {
          if (error) reject(error);
          else resolve(true);
        });
      });
    } else if (this.isWindows) {
      return new Promise((resolve, reject) => {
        exec(`explorer /select,"${absolutePath}"`, (error) => {
          if (error) reject(error);
          else resolve(true);
        });
      });
    } else if (this.isLinux) {
      // Attempt to use xdg-open (parent directory)
      return new Promise((resolve, reject) => {
        const dir = path.dirname(absolutePath);
        exec(`xdg-open "${dir}"`, (error) => {
          if (error) reject(error);
          else resolve(true);
        });
      });
    }
  }
}
```

### 3. Integration with CopyTree Command

```javascript
const Clipboard = require('./utils/Clipboard');
const TempFileManager = require('./utils/TempFileManager');
const ora = require('ora');
const chalk = require('chalk');

class CopyCommand {
  constructor() {
    this.clipboard = new Clipboard();
  }

  async execute(path, options) {
    const spinner = ora('Processing files...').start();
    
    try {
      // Generate content (XML, etc.)
      const content = await this.generateContent(path, options);
      
      // Handle different output modes
      if (options.output) {
        // Save to file
        await this.saveToFile(content, options.output);
        spinner.succeed('Content saved to file');
      } else if (options.display) {
        // Display to console
        console.log(content);
        spinner.succeed('Content displayed');
      } else if (options.asReference || options.r) {
        // Copy as file reference
        await this.copyAsFileReference(content, spinner);
      } else {
        // Default: copy text to clipboard
        await this.copyToClipboard(content, spinner);
      }
    } catch (error) {
      spinner.fail('Operation failed');
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  }

  async copyToClipboard(content, spinner) {
    try {
      await this.clipboard.copyText(content);
      spinner.succeed('Content copied to clipboard');
      
      // Show size info like PHP version
      const sizeInKB = Buffer.byteLength(content, 'utf8') / 1024;
      console.log(chalk.gray(`Clipboard content size: ${sizeInKB.toFixed(2)} KB`));
    } catch (error) {
      throw new Error(`Failed to copy to clipboard: ${error.message}`);
    }
  }

  async copyAsFileReference(content, spinner) {
    if (!this.clipboard.supportsFileReferences()) {
      throw new Error(
        'File reference copying is not supported on this platform. ' +
        'Use --output to save to a file instead.'
      );
    }

    // Create temporary file
    const tempFile = await TempFileManager.createTempFile(content, {
      extension: '.xml',
      prefix: 'copytree-'
    });

    try {
      await this.clipboard.copyFileReference(tempFile.path);
      spinner.succeed('File reference copied to clipboard');
      
      // Show file info like PHP version
      console.log(chalk.green(`✓ File: ${tempFile.name}`));
      console.log(chalk.gray(`  Size: ${tempFile.sizeFormatted}`));
      console.log(chalk.gray(`  Path: ${tempFile.path}`));
      
      // Optionally reveal in Finder/Explorer
      if (process.platform === 'darwin') {
        await this.clipboard.revealFile(tempFile.path);
      }
    } catch (error) {
      // Clean up temp file on error
      await TempFileManager.cleanup(tempFile.path);
      throw error;
    }
  }

  async generateContent(path, options) {
    // Implementation for generating XML content
    // This would use the file loading and processing logic
    return '<ct:project>...</ct:project>';
  }

  async saveToFile(content, outputPath) {
    const fs = require('fs').promises;
    await fs.writeFile(outputPath, content, 'utf8');
  }
}
```

### 4. TempFileManager Implementation

```javascript
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');

class TempFileManager {
  static getTempDir() {
    return path.join(os.tmpdir(), 'copytree');
  }

  static async createTempFile(content, options = {}) {
    const tempDir = this.getTempDir();
    
    // Ensure temp directory exists
    await fs.mkdir(tempDir, { recursive: true });
    
    // Generate unique filename
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    const prefix = options.prefix || 'temp-';
    const extension = options.extension || '.tmp';
    const filename = `${prefix}${timestamp}-${random}${extension}`;
    const filepath = path.join(tempDir, filename);
    
    // Write content
    await fs.writeFile(filepath, content, 'utf8');
    
    // Get file stats
    const stats = await fs.stat(filepath);
    const sizeInKB = stats.size / 1024;
    
    return {
      path: filepath,
      name: filename,
      size: stats.size,
      sizeFormatted: sizeInKB > 1024 
        ? `${(sizeInKB / 1024).toFixed(2)} MB`
        : `${sizeInKB.toFixed(2)} KB`,
      created: new Date()
    };
  }

  static async cleanup(filePath) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // Ignore errors during cleanup
    }
  }

  static async cleanupOldFiles(maxAgeHours = 24) {
    const tempDir = this.getTempDir();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    const now = Date.now();
    
    try {
      const files = await fs.readdir(tempDir);
      
      for (const file of files) {
        const filepath = path.join(tempDir, file);
        const stats = await fs.stat(filepath);
        
        if (now - stats.mtime.getTime() > maxAgeMs) {
          await this.cleanup(filepath);
        }
      }
    } catch (error) {
      // Ignore errors during cleanup
    }
  }
}

module.exports = TempFileManager;
```

### 5. Cross-Platform Considerations

```javascript
// Platform-specific clipboard manager
class PlatformClipboard {
  static create() {
    const platform = os.platform();
    
    switch (platform) {
      case 'darwin':
        return new MacOSClipboard();
      case 'win32':
        return new WindowsClipboard();
      case 'linux':
        return new LinuxClipboard();
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }
}

class MacOSClipboard extends Clipboard {
  async checkDependencies() {
    // macOS has pbcopy and osascript by default
    return true;
  }
}

class WindowsClipboard extends Clipboard {
  async checkDependencies() {
    // Windows has PowerShell by default
    return true;
  }
}

class LinuxClipboard extends Clipboard {
  async checkDependencies() {
    // Check for xclip or xsel
    return new Promise((resolve) => {
      exec('which xclip || which xsel', (error) => {
        resolve(!error);
      });
    });
  }

  async copyText(content) {
    // Try xclip first, then xsel, then clipboardy
    try {
      await this.copyWithXclip(content);
    } catch {
      try {
        await this.copyWithXsel(content);
      } catch {
        // Fall back to clipboardy
        await super.copyText(content);
      }
    }
  }

  async copyWithXclip(content) {
    return new Promise((resolve, reject) => {
      const proc = exec('xclip -selection clipboard', (error) => {
        if (error) reject(error);
        else resolve(true);
      });
      proc.stdin.write(content);
      proc.stdin.end();
    });
  }

  async copyWithXsel(content) {
    return new Promise((resolve, reject) => {
      const proc = exec('xsel --clipboard --input', (error) => {
        if (error) reject(error);
        else resolve(true);
      });
      proc.stdin.write(content);
      proc.stdin.end();
    });
  }
}
```

## Migration Checklist

1. **Install dependencies:**
   ```bash
   npm install clipboardy
   ```

2. **Replace PHP Clipboard class:**
   - Implement the JavaScript Clipboard class above
   - Add platform detection logic
   - Implement both text and file reference methods

3. **Update command handling:**
   - Replace `--as-reference` / `-r` flag handling
   - Add appropriate error messages for unsupported platforms
   - Implement temp file management for file references

4. **Add platform warnings:**
   - Warn Linux users that file references aren't supported
   - Provide helpful fallback options (--output flag)

5. **Test on all platforms:**
   - macOS: Both text and file reference copying
   - Windows: Both text and file reference copying
   - Linux: Text copying only, with appropriate warnings

## Usage Examples

```javascript
const clipboard = new Clipboard();

// Copy text (cross-platform)
await clipboard.copyText('Hello, world!');

// Copy file reference (macOS/Windows only)
if (clipboard.supportsFileReferences()) {
  await clipboard.copyFileReference('/path/to/file.xml');
}

// Copy multiple files
await clipboard.copyFileReferences([
  '/path/to/file1.xml',
  '/path/to/file2.xml'
]);

// Reveal file in Finder/Explorer
await clipboard.revealFile('/path/to/file.xml');
```

## Key Differences from PHP Implementation

1. **Async by default**: Node.js implementation uses promises/async-await
2. **Cross-platform text support**: Using clipboardy provides Linux support
3. **Better error handling**: More specific error messages and platform detection
4. **Modular design**: Separate classes for different platforms
5. **Windows support**: Added PowerShell implementation for file references

## Limitations and Workarounds

1. **Linux file references**: Not supported by most Linux desktop environments
   - Workaround: Use --output flag to save to file
   - Alternative: Implement drag-and-drop using Electron if GUI needed

2. **Binary clipboard data**: Not supported by clipboardy
   - Workaround: For images, save to temp file and copy reference

3. **Multiple clipboard formats**: Cannot provide both text and file reference
   - Must choose one format at copy time

## Security Considerations

1. **Command injection**: Always escape file paths in shell commands
2. **Temp file permissions**: Ensure temp files have appropriate permissions
3. **Cleanup**: Implement automatic cleanup of old temp files
4. **Path validation**: Validate file paths before processing

This implementation provides feature parity with the PHP version while adding cross-platform support for text operations and maintaining platform-specific implementations for file reference copying.