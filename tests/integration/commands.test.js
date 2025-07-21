const { exec } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');

// Helper to run CLI commands
function runCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    exec(command, { 
      cwd: options.cwd || process.cwd(),
      timeout: options.timeout || 30000
    }, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr, exitCode: error ? error.code : 0 });
    });
  });
}

describe('Command Integration Tests', () => {
  let tempDir;
  let testProjectDir;
  const cliPath = path.join(__dirname, '../../bin/copytree.js');

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copytree-integration-'));
    testProjectDir = path.join(tempDir, 'test-project');
    
    // Create test project structure
    await fs.ensureDir(testProjectDir);
    await fs.writeFile(path.join(testProjectDir, 'README.md'), '# Test Project\n\nThis is a test project.');
    await fs.writeFile(path.join(testProjectDir, 'package.json'), JSON.stringify({
      name: 'test-project',
      version: '1.0.0',
      description: 'Test project for copytree'
    }, null, 2));
    
    await fs.ensureDir(path.join(testProjectDir, 'src'));
    await fs.writeFile(path.join(testProjectDir, 'src/index.js'), 'console.log("Hello World");');
    await fs.writeFile(path.join(testProjectDir, 'src/utils.js'), 'module.exports = { helper: () => {} };');
  });

  afterEach(async () => {
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  describe('Help and Version', () => {
    test('should show help message', async () => {
      const { stdout, exitCode } = await runCommand(`node "${cliPath}" --help`);
      
      expect(exitCode).toBe(0);
      expect(stdout).toContain('copytree');
      expect(stdout).toContain('Commands:');
    });

    test('should show version', async () => {
      const { stdout, exitCode } = await runCommand(`node "${cliPath}" --version`);
      
      expect(exitCode).toBe(0);
      expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('Copy Command', () => {
    test('should copy files to XML output', async () => {
      const outputFile = path.join(tempDir, 'output.xml');
      const { exitCode, stderr } = await runCommand(
        `node "${cliPath}" copy "${testProjectDir}" --output "${outputFile}"`,
        { timeout: 45000 }
      );
      
      expect(exitCode).toBe(0);
      if (stderr) {
        console.warn('Copy command stderr:', stderr);
      }
      
      // Check output file exists and contains XML
      expect(await fs.pathExists(outputFile)).toBe(true);
      const content = await fs.readFile(outputFile, 'utf8');
      expect(content).toContain('<?xml');
      expect(content).toContain('<files>');
    });

    test('should copy with dry-run flag', async () => {
      const { stdout, exitCode } = await runCommand(
        `node "${cliPath}" copy "${testProjectDir}" --dry-run`
      );
      
      expect(exitCode).toBe(0);
      expect(stdout).toContain('DRY RUN');
    });

    test('should handle non-existent directory', async () => {
      const { exitCode, stderr } = await runCommand(
        `node "${cliPath}" copy "/non/existent/path"`
      );
      
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('does not exist');
    });
  });

  describe('Profile Commands', () => {
    test('profile:list should list available profiles', async () => {
      const { stdout, exitCode } = await runCommand(
        `node "${cliPath}" profile:list`
      );
      
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Available Profiles');
      expect(stdout).toContain('Built-in Profiles');
    });

    test('profile:validate should validate default profile', async () => {
      const { stdout, exitCode } = await runCommand(
        `node "${cliPath}" profile:validate default`
      );
      
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Validating profile: default');
      expect(stdout).toContain('Profile loaded successfully');
    });

    test('profile:validate should fail for non-existent profile', async () => {
      const { exitCode, stderr } = await runCommand(
        `node "${cliPath}" profile:validate non-existent-profile`
      );
      
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('Profile not found');
    });
  });

  describe('Cache Commands', () => {
    test('cache:clear should clear cache', async () => {
      const { stdout, exitCode } = await runCommand(
        `node "${cliPath}" cache:clear`
      );
      
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Cache cleared');
    });
  });

  describe('Configuration Commands', () => {
    test('config:validate should validate configuration', async () => {
      const { stdout, exitCode } = await runCommand(
        `node "${cliPath}" config:validate`
      );
      
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Validating CopyTree Configuration');
      expect(stdout).toContain('Configuration is valid');
    });
  });

  describe('Install Commands', () => {
    test('install:claude should create mcp.json', async () => {
      const mcpFile = path.join(testProjectDir, 'mcp.json');
      
      // Ensure clean state
      if (await fs.pathExists(mcpFile)) {
        await fs.remove(mcpFile);
      }
      
      const { stdout, exitCode } = await runCommand(
        `node "${cliPath}" install:claude --force`,
        { cwd: testProjectDir }
      );
      
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Claude Code integration installed successfully');
      
      // Check mcp.json was created
      expect(await fs.pathExists(mcpFile)).toBe(true);
      const mcpConfig = await fs.readJson(mcpFile);
      expect(mcpConfig.mcpServers.copytree).toBeDefined();
      expect(mcpConfig.mcpServers.copytree.command).toBe('copytree');
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid command', async () => {
      const { exitCode, stderr } = await runCommand(
        `node "${cliPath}" invalid-command`
      );
      
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('Unknown command');
    });

    test('should handle invalid options', async () => {
      const { exitCode, stderr } = await runCommand(
        `node "${cliPath}" copy --invalid-option`
      );
      
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('Unknown option');
    });
  });

  describe('Output Formats', () => {
    test('should support JSON output format', async () => {
      const outputFile = path.join(tempDir, 'output.json');
      const { exitCode } = await runCommand(
        `node "${cliPath}" copy "${testProjectDir}" --output "${outputFile}" --format json`
      );
      
      expect(exitCode).toBe(0);
      expect(await fs.pathExists(outputFile)).toBe(true);
      
      const content = await fs.readFile(outputFile, 'utf8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    test('should support tree output format', async () => {
      const { stdout, exitCode } = await runCommand(
        `node "${cliPath}" copy "${testProjectDir}" --format tree`
      );
      
      expect(exitCode).toBe(0);
      expect(stdout).toContain('└─');
    });
  });

  describe('File Filtering', () => {
    test('should respect include patterns', async () => {
      const { stdout, exitCode } = await runCommand(
        `node "${cliPath}" copy "${testProjectDir}" --include "*.js" --format tree`
      );
      
      expect(exitCode).toBe(0);
      expect(stdout).toContain('index.js');
      expect(stdout).toContain('utils.js');
      expect(stdout).not.toContain('README.md');
    });

    test('should respect exclude patterns', async () => {
      const { stdout, exitCode } = await runCommand(
        `node "${cliPath}" copy "${testProjectDir}" --exclude "*.json" --format tree`
      );
      
      expect(exitCode).toBe(0);
      expect(stdout).toContain('README.md');
      expect(stdout).not.toContain('package.json');
    });
  });

  describe('Clipboard Integration', () => {
    test('should copy to clipboard when no output specified', async () => {
      const { stdout, exitCode } = await runCommand(
        `node "${cliPath}" copy "${testProjectDir}" --dry-run`
      );
      
      expect(exitCode).toBe(0);
      expect(stdout).toContain('DRY RUN');
      // Note: We can't easily test actual clipboard in CI, so we test dry-run
    });
  });

  describe('Performance', () => {
    test('should complete copy command within reasonable time', async () => {
      const startTime = Date.now();
      const { exitCode } = await runCommand(
        `node "${cliPath}" copy "${testProjectDir}" --dry-run`
      );
      const duration = Date.now() - startTime;
      
      expect(exitCode).toBe(0);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });
});