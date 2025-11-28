# Electron Integration Guide

CopyTree works seamlessly in Electron ≥28 main processes. This guide covers installation, usage patterns, and common troubleshooting scenarios.

## Requirements

- **Electron ≥28** (Node.js 20+)
- **ESM-enabled main process** (recommended) or dynamic imports for CommonJS

## Installation

```bash
npm install copytree
```

> **Note:** Add `copytree` to `dependencies` (not `devDependencies`) to ensure it's available at runtime.

## Usage in Main Process

### ESM (Recommended)

For Electron apps using ESM in the main process:

```javascript
// main.js
import { app } from 'electron';
import { copy } from 'copytree';

app.on('ready', async () => {
  const result = await copy('./project', {
    format: 'json',
    onProgress: ({ percent }) => {
      console.log(`Progress: ${percent}%`);
    },
  });

  console.log('Output:', result.output);
});
```

### CommonJS

CopyTree is ESM-only. For CommonJS main processes, use dynamic imports:

```javascript
// main.js
const { app } = require('electron');

app.on('ready', async () => {
  const { copy } = await import('copytree');
  const result = await copy('./project');
  console.log('Output:', result.output);
});
```

## IPC Communication

Use IPC to communicate progress and results from Main to Renderer:

### Main Process

```javascript
// main.js
import { ipcMain } from 'electron';
import { copy } from 'copytree';

ipcMain.handle('copy-project', async (event, path, options = {}) => {
  return await copy(path, {
    ...options,
    onProgress: ({ percent, message }) => {
      event.sender.send('copy-progress', { percent, message });
    },
  });
});
```

### Renderer Process

```javascript
// renderer.js (preload script or context bridge)
const { ipcRenderer } = require('electron');

// Listen for progress updates
ipcRenderer.on('copy-progress', (event, { percent, message }) => {
  updateProgressBar(percent, message);
});

// Invoke copy operation
async function copyProject(path) {
  const result = await ipcRenderer.invoke('copy-project', path, {
    format: 'json',
  });
  return result;
}
```

## Streaming Large Projects

For large codebases, use streaming to handle output efficiently:

```javascript
// main.js
import { copyStream } from 'copytree';

ipcMain.handle('copy-project-stream', async (event, path) => {
  const chunks = [];

  for await (const chunk of copyStream(path, { format: 'json' })) {
    chunks.push(chunk);
    event.sender.send('copy-chunk', chunk);
  }

  return chunks.join('');
});
```

## Configuration Management

Each `ConfigManager` instance is isolated, making it safe for multiple concurrent operations:

```javascript
import { ConfigManager, copy } from 'copytree';

// Create isolated configurations for different operations
const config1 = await ConfigManager.create({ basePath: './project-a' });
const config2 = await ConfigManager.create({ basePath: './project-b' });

// Run operations in parallel with different configs
const [result1, result2] = await Promise.all([
  copy('./project-a', { config: config1 }),
  copy('./project-b', { config: config2 }),
]);
```

## Bundler Configuration

CopyTree works with common Electron bundlers without special configuration:

### Webpack (Electron Forge/Builder)

No special configuration needed. CopyTree is marked with `"sideEffects": false` for optimal tree-shaking.

### Vite

```javascript
// vite.config.js
export default {
  build: {
    rollupOptions: {
      external: ['copytree'], // Keep as external for main process
    },
  },
};
```

### esbuild

```javascript
// build.js
require('esbuild').build({
  entryPoints: ['main.js'],
  bundle: true,
  platform: 'node',
  external: ['copytree'],
  outfile: 'dist/main.js',
});
```

## Common Issues

### ERR_REQUIRE_ESM

**Error:** `Error [ERR_REQUIRE_ESM]: require() of ES Module ... not supported`

**Cause:** Attempting to `require()` CopyTree directly.

**Solution:** Use dynamic import:
```javascript
// ❌ Wrong
const { copy } = require('copytree');

// ✅ Correct
const { copy } = await import('copytree');
```

### Module Not Found

**Error:** `Cannot find module 'copytree'`

**Solutions:**
1. Ensure `copytree` is in `dependencies`, not `devDependencies`
2. Run `npm install` after adding the dependency
3. Check if bundler is configured to externalize Node.js modules

### Path Resolution Issues

**Error:** Paths not resolving correctly in packaged app.

**Solution:** Use absolute paths or resolve relative to `app.getAppPath()`:
```javascript
import { app } from 'electron';
import path from 'path';

const projectPath = path.join(app.getAppPath(), 'my-project');
const result = await copy(projectPath);
```

### Memory Issues with Large Projects

**Symptoms:** High memory usage or crashes with large codebases.

**Solutions:**
1. Use streaming mode:
   ```javascript
   for await (const chunk of copyStream(path)) {
     // Process chunks incrementally
   }
   ```
2. Set file limits:
   ```javascript
   await copy(path, { maxTotalSize: 10 * 1024 * 1024 }); // 10MB limit
   ```

## Compatibility Matrix

| Electron Version | Node.js | CopyTree Support |
|------------------|---------|------------------|
| ≥28 (LTS)        | ≥20     | ✅ Full support   |
| 24-27            | 18-19   | ⚠️ May work       |
| <24              | <18     | ❌ Not supported  |

## Best Practices

1. **Main Process Only:** Run CopyTree in the main process, not the renderer
2. **Use IPC:** Communicate results via IPC to renderer processes
3. **Stream Large Projects:** Use `copyStream()` for projects >10MB
4. **Isolate Configs:** Create separate `ConfigManager` instances for concurrent operations
5. **Handle Errors:** Wrap CopyTree calls in try-catch for graceful error handling

## Related Documentation

- [Installation Guide](./installation-guide.md) - General installation
- [Basic Usage](../usage/basic-usage.md) - CLI and programmatic usage
- [Configuration Reference](../reference/configuration.md) - Configuration options
