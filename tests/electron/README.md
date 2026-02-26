# Electron Integration Tests

This directory contains tests verifying CopyTree works correctly in Electron environments.

## Requirements

- **Electron ≥28** (Node.js 20+)
- **Display server** (or Xvfb on Linux for headless)

## Running Tests

### From Project Root

```bash
# Run Electron integration tests (requires Electron installed)
npm run test:electron
```

### Manual Testing

```bash
cd tests/electron
npm install
npm test
```

## Test Coverage

### `main.js` - ESM Main Process Tests

Tests ESM imports and basic functionality:

1. **ESM imports work correctly** - Verifies all exports are accessible
2. **copy() produces output** - Basic copy operation with JSON format
3. **scan() returns file list** - File discovery works
4. **ConfigManager instances are isolated** - No singleton issues
5. **copyStream() produces chunks** - Streaming works

### `main-cjs.js` - CommonJS Dynamic Import Test

Tests the CommonJS compatibility path:

```javascript
// This pattern should work
const { copy } = await import('copytree');
```

## CI Integration

For headless CI environments, use Xvfb:

```yaml
# GitHub Actions example
- name: Run Electron Tests
  run: |
    sudo apt-get install -y xvfb
    xvfb-run npm run test:electron
```

## Troubleshooting

### Display Issues

**Error:** Cannot open display

**Solution:** Use Xvfb or run with a display server:
```bash
xvfb-run npm run test:electron
```

### Module Resolution

**Error:** Cannot find module 'copytree'

**Solution:** Ensure the package is linked:
```bash
npm link  # In project root
```

### Electron Not Found

**Error:** Cannot find electron

**Solution:** Install Electron in test directory:
```bash
cd tests/electron && npm install
```
