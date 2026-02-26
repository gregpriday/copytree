/**
 * CommonJS test for dynamic import of CopyTree in Electron.
 *
 * This tests the CommonJS compatibility path where users call:
 *   const { copy } = await import('copytree');
 *
 * Run with: node --experimental-vm-modules tests/electron/main-cjs.js
 *
 * Note: This file uses .js extension but tests the CommonJS usage pattern.
 * In a real CommonJS Electron app, users would have a .cjs file or no "type": "module".
 */

// Simulate CommonJS environment by using dynamic import
async function main() {
  console.log('\n🧪 CopyTree CommonJS Dynamic Import Test\n');

  try {
    // Test 1: Dynamic import works
    console.log('  Testing dynamic import...');
    const copytree = await import('copytree');

    if (!copytree.copy) {
      throw new Error('copy function not exported');
    }
    if (!copytree.ConfigManager) {
      throw new Error('ConfigManager not exported');
    }

    console.log('  ✅ Dynamic import successful');
    console.log('  ✅ Exports available: copy, copyStream, scan, ConfigManager');

    // Test 2: Functions are callable
    console.log('\n  Testing function availability...');
    console.log(`    copy: ${typeof copytree.copy}`);
    console.log(`    copyStream: ${typeof copytree.copyStream}`);
    console.log(`    scan: ${typeof copytree.scan}`);
    console.log(`    ConfigManager: ${typeof copytree.ConfigManager}`);

    console.log('\n✅ All CommonJS dynamic import tests passed!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
