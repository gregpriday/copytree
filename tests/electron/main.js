/**
 * Electron test app for verifying CopyTree ESM imports.
 *
 * This app tests that CopyTree works correctly in an Electron main process context.
 * It verifies:
 * - ESM imports work correctly
 * - Core exports (copy, copyStream, scan, ConfigManager) are accessible
 * - Basic functionality works in Electron's Node.js environment
 *
 * Run with: npm run test:electron (from project root)
 * Or: cd tests/electron && npm install && npm test
 */

import { app } from 'electron';
import { test, describe } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Get directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const fixturesPath = path.join(projectRoot, 'tests/fixtures/simple-project');

// Disable hardware acceleration to run headless
app.disableHardwareAcceleration();

// Track test results
let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;
const errors = [];

/**
 * Simple test runner for Electron context
 */
async function runTests() {
  console.log('\n🧪 CopyTree Electron Integration Tests\n');
  console.log(`📁 Project root: ${projectRoot}`);
  // Stated, because the compatibility matrix in the integration guide is a
  // claim about this pairing, and it had drifted from it in three directions at
  // once. The pin was Electron 28, which bundles Node 18.18 — below the
  // `engines` floor of 22.12 — so this suite was proving something about a
  // configuration the package does not claim to support.
  console.log(`   Electron ${process.versions.electron} bundles Node ${process.versions.node}`);
  console.log(`📁 Fixtures path: ${fixturesPath}\n`);

  // Test 1: ESM imports work
  await runTest('ESM imports work correctly', async () => {
    const copytree = await import('copytree');

    assert.ok(copytree.copy, 'copy function should be exported');
    assert.ok(copytree.copyStream, 'copyStream function should be exported');
    assert.ok(copytree.scan, 'scan function should be exported');
    assert.ok(copytree.ConfigManager, 'ConfigManager class should be exported');
    assert.strictEqual(typeof copytree.copy, 'function', 'copy should be a function');
    assert.strictEqual(typeof copytree.copyStream, 'function', 'copyStream should be a function');
    assert.strictEqual(typeof copytree.scan, 'function', 'scan should be a function');
  });

  // Test 2: copy() works with simple project
  await runTest('copy() produces output', async () => {
    const { copy } = await import('copytree');

    const result = await copy(fixturesPath, {
      format: 'json',
    });

    assert.ok(result, 'copy should return a result');
    assert.ok(result.output, 'result should have output');
    assert.ok(result.output.length > 0, 'output should not be empty');

    // Verify it's valid JSON
    const parsed = JSON.parse(result.output);
    assert.ok(parsed, 'output should be valid JSON');
  });

  // Test 3: scan() works
  await runTest('scan() yields files', async () => {
    const { scan } = await import('copytree');

    // `scan()` is an async generator, not a function returning `{ files }`.
    // `await`-ing it returns the generator object, whose `.files` is undefined
    // — so this asserted `Array.isArray(undefined)` and had been failing since
    // the API became streaming.
    const files = [];
    let summaryAtFirstYield;
    let summary = null;

    for await (const file of scan(fixturesPath, { onSummary: (s) => (summary = s) })) {
      // Captured on the first iteration: `onSummary` is documented as firing
      // before the first yield, and checking it after the loop would pass even
      // if it fired last.
      if (summaryAtFirstYield === undefined) summaryAtFirstYield = summary;
      files.push(file);
    }

    assert.ok(files.length > 0, 'scan should yield at least one file');
    assert.ok(
      files.every((file) => typeof file.path === 'string' && !file.path.includes('\\')),
      'every file should carry a POSIX path',
    );
    assert.ok(summaryAtFirstYield, 'onSummary should fire before the first yield');
    assert.strictEqual(summary.totalFiles, files.length, 'summary should match what was yielded');
  });

  // Test 4: ConfigManager isolation
  await runTest('ConfigManager instances are isolated', async () => {
    const { ConfigManager } = await import('copytree');

    const config1 = await ConfigManager.create();
    const config2 = await ConfigManager.create();

    config1.set('test.isolation', 'value1');
    config2.set('test.isolation', 'value2');

    assert.strictEqual(
      config1.get('test.isolation'),
      'value1',
      'config1 should have its own value',
    );
    assert.strictEqual(
      config2.get('test.isolation'),
      'value2',
      'config2 should have its own value',
    );
  });

  // Test 5: copyStream works
  await runTest('copyStream() produces chunks', async () => {
    const { copyStream } = await import('copytree');

    let chunkCount = 0;
    let totalLength = 0;

    for await (const chunk of copyStream(fixturesPath, { format: 'json' })) {
      chunkCount++;
      totalLength += chunk.length;
    }

    assert.ok(chunkCount > 0, 'should produce at least one chunk');
    assert.ok(totalLength > 0, 'total output should not be empty');
  });

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Test Summary: ${testsPassed}/${testsRun} passed`);

  if (testsFailed > 0) {
    console.log(`\n❌ ${testsFailed} test(s) failed:\n`);
    errors.forEach(({ name, error }) => {
      console.log(`  • ${name}`);
      console.log(`    ${error.message}\n`);
    });
  } else {
    console.log('\n✅ All tests passed!');
  }

  return testsFailed === 0;
}

/**
 * Run a single test with error handling
 */
async function runTest(name, fn) {
  testsRun++;
  try {
    await fn();
    testsPassed++;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    testsFailed++;
    errors.push({ name, error });
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error.message}`);
  }
}

// Run tests when Electron is ready
app.whenReady().then(async () => {
  try {
    const success = await runTests();
    app.exit(success ? 0 : 1);
  } catch (error) {
    console.error('\n💥 Fatal error running tests:', error);
    app.exit(1);
  }
});

// Handle app errors
app.on('window-all-closed', () => {
  app.quit();
});
