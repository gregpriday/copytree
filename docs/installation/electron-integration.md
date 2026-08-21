# Electron Integration Guide

CopyTree runs in an Electron main process. This guide covers installation, usage
patterns, and common troubleshooting scenarios.

## Requirements

- **Electron ≥35**, which is the first line bundling Node 22 — the runtime
  `engines` requires. This page previously said ≥28 in one place and ≥34 in
  another, and its compatibility matrix called Electron 28 with Node 20 "full
  support"; none of the three agreed with `package.json`.
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

**Solution: set budgets.** They are the only thing that bounds memory.

```javascript
await copy(path, {
  maxTotalSize: 10 * 1024 * 1024, // stop selecting past 10MB
  maxFileCount: 2000,
  charLimit: 400_000,
});
```

`copyStream()` is **not** a memory solution, and recommending it as one here was
wrong. It drains the whole selection before the first chunk — the document
header carries a file count and a total size — so peak memory is the same. What
it saves is the second contiguous copy of the finished document, and it lets
output start reaching a socket or a file before the last file is rendered.

## Compatibility Matrix

| Electron Version | Bundled Node | CopyTree Support                        |
| ---------------- | ------------ | --------------------------------------- |
| ≥35              | ≥22.14       | ✅ Supported — meets `engines`          |
| 30–34            | 20.x         | ⚠️ May work; below the declared minimum |
| <30              | ≤18.x        | ❌ Not supported                        |

> **Known gap.** `npm run test:electron` still pins Electron 28, which bundles
> Node 18.18 — so the smoke suite does not currently exercise the supported
> configuration. The suite prints the pairing it ran on. Raising the pin is
> tracked separately; it needs a CI runner that can download the newer binary.

## Best Practices

1. **Main Process Only:** Run CopyTree in the main process, not the renderer
2. **Use IPC:** Communicate results via IPC to renderer processes
3. **Bound Large Projects:** Use `maxTotalSize`, `maxFileCount` and `charLimit`.
   `copyStream()` avoids a second copy of the output, not the selection
4. **Isolate Configs:** Create separate `ConfigManager` instances for concurrent operations
5. **Handle Errors:** Wrap CopyTree calls in try-catch for graceful error handling

## Related Documentation

- [Installation Guide](./installation-guide.md) - General installation
- [Basic Usage](../usage/basic-usage.md) - CLI and programmatic usage
- [Configuration Reference](../reference/configuration.md) - Configuration options
