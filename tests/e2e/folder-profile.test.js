import { execSync } from 'child_process';
import path from 'path';
import os from 'os';

const fs = jest.requireActual('fs-extra');

describe('Folder Profile E2E Tests', () => {
  jest.setTimeout(30000);

  let tmpDir;
  let testProjectDir;
  const copytreeBin = path.join(process.cwd(), 'bin', 'copytree.js');

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copytree-e2e-'));
    testProjectDir = path.join(tmpDir, 'test-project');
    await fs.ensureDir(testProjectDir);

    await fs.writeFile(path.join(testProjectDir, 'README.md'), '# Test');
    await fs.writeFile(path.join(testProjectDir, 'index.js'), 'console.log("main");');
    await fs.writeFile(path.join(testProjectDir, 'index.test.js'), 'test("main", () => {});');
    await fs.ensureDir(path.join(testProjectDir, 'src'));
    await fs.writeFile(path.join(testProjectDir, 'src', 'app.js'), 'export default {};');
    await fs.writeFile(path.join(testProjectDir, 'src', 'app.test.js'), 'test("app", () => {});');
    await fs.ensureDir(path.join(testProjectDir, 'docs'));
    await fs.writeFile(path.join(testProjectDir, 'docs', 'guide.md'), '# Guide');
  });

  afterEach(async () => {
    if (tmpDir && (await fs.pathExists(tmpDir))) {
      await fs.remove(tmpDir);
    }
  });

  const runCopytree = (args) => {
    try {
      const stdout = execSync(`node "${copytreeBin}" copy . ${args}`, {
        cwd: testProjectDir,
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_ENV: 'production',
        },
      });
      return { stdout, stderr: '', exitCode: 0 };
    } catch (error) {
      return {
        stdout: error.stdout?.toString() || '',
        stderr: error.stderr?.toString() || '',
        exitCode: error.status || 1,
      };
    }
  };

  it('auto-discovers .copytree.yml with -r', async () => {
    await fs.writeFile(path.join(testProjectDir, '.copytree.yml'), 'include:\n  - "**/*.md"\n');
    const outputFile = path.join(testProjectDir, 'output.json');

    const { exitCode } = runCopytree(`-r --format json -o "${outputFile}" --stream`);
    expect(exitCode).toBe(0);

    const output = await fs.readJson(outputFile);
    const filePaths = output.files.map((f) => f.path);

    expect(filePaths).toContain('README.md');
    expect(filePaths).toContain('docs/guide.md');
    expect(filePaths).not.toContain('index.js');
  });

  it('loads named profile with -p and --profile', async () => {
    await fs.writeFile(
      path.join(testProjectDir, '.copytree-docs.yml'),
      'include:\n  - "**/*.md"\n',
    );

    const outputA = path.join(testProjectDir, 'output-a.json');
    const first = runCopytree(`-p docs --format json -o "${outputA}" --stream`);
    expect(first.exitCode).toBe(0);

    const parsedA = await fs.readJson(outputA);
    const pathsA = parsedA.files.map((f) => f.path);
    expect(pathsA).toContain('README.md');
    expect(pathsA).not.toContain('index.js');

    const outputB = path.join(testProjectDir, 'output-b.json');
    const second = runCopytree(`--profile docs --format json -o "${outputB}" --stream`);
    expect(second.exitCode).toBe(0);

    const parsedB = await fs.readJson(outputB);
    const pathsB = parsedB.files.map((f) => f.path);
    expect(pathsB).toContain('README.md');
    expect(pathsB).not.toContain('index.js');
  });

  it('returns a non-zero exit code for missing named profiles', async () => {
    const { exitCode, stderr } = runCopytree('-p missing --format json --stream');

    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/Profile not found/);
  });

  it('prioritizes .copytree.yml over .copytree.json during auto-discovery', async () => {
    await fs.writeFile(path.join(testProjectDir, '.copytree.yml'), 'include:\n  - "**/*.md"\n');
    await fs.writeJson(path.join(testProjectDir, '.copytree.json'), { include: ['**/*.js'] });

    const outputFile = path.join(testProjectDir, 'output.json');
    const { exitCode } = runCopytree(`-r --format json -o "${outputFile}" --stream`);
    expect(exitCode).toBe(0);

    const output = await fs.readJson(outputFile);
    const filePaths = output.files.map((f) => f.path);

    expect(filePaths).toContain('README.md');
    expect(filePaths).not.toContain('index.js');
  });

  it('continues without profile when auto-discovered profile is malformed', async () => {
    await fs.writeFile(path.join(testProjectDir, '.copytree.yml'), 'invalid: yaml: syntax:');

    const outputFile = path.join(testProjectDir, 'output.json');
    const { exitCode } = runCopytree(`-r --format json -o "${outputFile}" --stream`);
    expect(exitCode).toBe(0);

    const output = await fs.readJson(outputFile);
    const filePaths = output.files.map((f) => f.path);

    expect(filePaths).toContain('index.js');
    expect(filePaths).toContain('README.md');
  });

  it('supports --only-tree with streamed file output', async () => {
    const outputFile = path.join(testProjectDir, 'tree.txt');
    const { exitCode } = runCopytree(`--only-tree --format tree -o "${outputFile}" --stream`);
    expect(exitCode).toBe(0);

    const output = await fs.readFile(outputFile, 'utf8');
    expect(output).toContain('index.js');
    expect(output).toContain('README.md');
    expect(output).not.toContain('console.log("main");');
  });
});
