/**
 * E2E: the read-only query commands.
 *
 * `plan`, `inspect`, `explain` and the `ignore` trio are the workflow the CLI
 * specification is built around, so these tests check the contract a consumer
 * — human or agent — actually depends on: the payload is on stdout, the schema
 * is versioned, no file contents are read, and the plan predicts the copy.
 */

import path from 'path';
import os from 'os';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { runCli } from './_utils.js';

const SIMPLE = path.resolve(process.cwd(), 'tests/fixtures/simple-project');

let PROJECT;

beforeAll(() => {
  PROJECT = mkdtempSync(path.join(os.tmpdir(), 'copytree-query-'));
  mkdirSync(path.join(PROJECT, 'src'), { recursive: true });
  mkdirSync(path.join(PROJECT, 'docs'), { recursive: true });
  mkdirSync(path.join(PROJECT, 'tests'), { recursive: true });

  writeFileSync(path.join(PROJECT, 'package.json'), '{"name":"query-fixture"}\n');
  writeFileSync(path.join(PROJECT, 'src/index.js'), 'export const a = 1;\n');
  writeFileSync(path.join(PROJECT, 'src/util.js'), 'export const b = 2;\n');
  writeFileSync(path.join(PROJECT, 'docs/guide.md'), '# Guide\n');
  writeFileSync(path.join(PROJECT, 'docs/api.md'), '# API\n');
  writeFileSync(path.join(PROJECT, 'tests/index.test.js'), 'test("x", () => {});\n');
  writeFileSync(path.join(PROJECT, '.gitignore'), 'ignored.txt\n');
  writeFileSync(path.join(PROJECT, 'ignored.txt'), 'not selected\n');
});

afterAll(() => {
  if (PROJECT) rmSync(PROJECT, { recursive: true, force: true });
});

describe('copytree plan', () => {
  test('lists the exact selected paths on stdout and reads no contents', async () => {
    const { code, stdout, stderr } = await runCli(['plan', PROJECT]);

    expect(code).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain('Plan for');
    expect(stdout).toContain('src/index.js');
    expect(stdout).toContain('No file contents were read.');
    // A gitignored file is not a candidate.
    expect(stdout).not.toContain('ignored.txt');
  }, 30000);

  test('emits a versioned, parseable schema', async () => {
    const { code, stdout } = await runCli(['plan', PROJECT, '--format', 'json']);

    expect(code).toBe(0);
    const model = JSON.parse(stdout);

    expect(model.schema).toBe('copytree-plan@1');
    expect(model.contentRead).toBe(false);
    expect(model.exactness.pathSelection).toBe('exact');
    expect(model.summary.selected).toBe(model.entries.length);
    expect(model.entries.every((entry) => entry.decision === 'selected')).toBe(true);
  }, 30000);

  test('--explain names the rule and its source for excluded entries', async () => {
    const { code, stdout } = await runCli([
      'plan',
      PROJECT,
      '--explain',
      '--format',
      'json',
      '--exclude',
      'docs/',
    ]);

    expect(code).toBe(0);
    const model = JSON.parse(stdout);
    // One `entries` array, as `PlanEntryV1` declares: each entry carries its
    // own decision. An excluded directory is pruned rather than walked, so the
    // ledger records the directory-level decision — which is the one made.
    const excluded = model.entries.filter(
      (entry) => entry.decision === 'excluded' && entry.path.startsWith('docs'),
    );

    expect(excluded.length).toBeGreaterThan(0);
    expect(excluded[0].reason).toBe('optionExclude');
    expect(excluded[0].rule).toBeTruthy();
    expect(excluded[0].ruleSource).toBe('option:--exclude');
    expect(excluded[0].ruleLine).toBe(1);
  }, 30000);

  test('--summary omits the entry list', async () => {
    const { code, stdout } = await runCli(['plan', PROJECT, '--summary']);

    expect(code).toBe(0);
    expect(stdout).toContain('Plan for');
    expect(stdout).not.toContain('Selected files:');
  }, 30000);

  test('ndjson emits one valid object per line', async () => {
    const { code, stdout } = await runCli(['plan', PROJECT, '--format', 'ndjson']);

    expect(code).toBe(0);
    const lines = stdout.trim().split('\n');
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();
    expect(JSON.parse(lines[0]).type).toBe('summary');
  }, 30000);

  test('--fail-empty is a policy failure, not an operational one', async () => {
    const { code } = await runCli(['plan', PROJECT, '--include', '**/*.nothing', '--fail-empty']);
    expect(code).toBe(3);
  }, 30000);

  test('an empty selection is a valid outcome by default', async () => {
    const { code } = await runCli(['plan', PROJECT, '--include', '**/*.nothing']);
    expect(code).toBe(0);
  }, 30000);
});

// The one guarantee that makes a preview worth having.
describe('plan and copy agree', () => {
  const cases = [
    ['no options', []],
    ['--include', ['--include', '**/*.js']],
    ['--exclude', ['--exclude', 'docs/']],
    ['--max-files with sorting', ['--max-files', '2', '--sort', 'size']],
    ['--scope', ['--scope', 'src']],
    ['--force-include over gitignore', ['--force-include', 'ignored.txt']],
  ];

  test.each(cases)(
    'selection matches for %s',
    async (_name, args) => {
      const planned = await runCli(['plan', PROJECT, '--format', 'json', ...args]);
      const copied = await runCli([PROJECT, '--stdout', '--format', 'json', ...args]);

      expect(planned.code).toBe(0);
      expect(copied.code).toBe(0);

      const plannedPaths = JSON.parse(planned.stdout).entries.map((entry) => entry.path);
      const copiedPaths = JSON.parse(copied.stdout).files.map((file) => file.path);

      // Identical, and in identical order: budgets truncate from the tail, so an
      // order that differed would mean a different set survived.
      expect(plannedPaths).toEqual(copiedPaths);
    },
    30000,
  );
});

describe('copytree inspect', () => {
  test('reports structure, rules and budgets without reading contents', async () => {
    const { code, stdout } = await runCli([
      'inspect',
      PROJECT,
      '--view',
      'all',
      '--format',
      'json',
    ]);

    expect(code).toBe(0);
    const model = JSON.parse(stdout);

    expect(model.schema).toBe('copytree-inspect@1');
    expect(model.contentRead).toBe(false);
    expect(model.ruleSources.length).toBeGreaterThan(0);
    expect(model.budgets.sizeGate).toHaveProperty('source');
    expect(model.directories.some((entry) => entry.path === 'src/')).toBe(true);
    expect(model.extensions.some((entry) => entry.extension === '.js')).toBe(true);
  }, 30000);

  test('--view rules lists the sources in evaluation order', async () => {
    const { code, stdout } = await runCli(['inspect', PROJECT, '--view', 'rules']);

    expect(code).toBe(0);
    expect(stdout).toContain('Active rule sources, in evaluation order:');
    expect(stdout).toContain('[initial]');
    expect(stdout).toContain('[nested]');
  }, 30000);
});

describe('copytree explain', () => {
  test('traces an included path to its final decision', async () => {
    const { code, stdout } = await runCli(['explain', 'src/index.js', '--root', PROJECT]);

    expect(code).toBe(0);
    expect(stdout).toContain('@src/index.js');
    expect(stdout).toContain('root containment');
    expect(stdout).toContain('size gate');
    expect(stdout).toContain('final decision    included');
  }, 30000);

  test('names the rule that excluded a path', async () => {
    const { code, stdout } = await runCli([
      'explain',
      'ignored.txt',
      '--root',
      PROJECT,
      '--format',
      'json',
    ]);

    expect(code).toBe(0);
    const model = JSON.parse(stdout);
    expect(model.schema).toBe('copytree-explain@1');

    const [entry] = model.entries;
    expect(entry.decision).toBe('excluded');

    const rule = entry.steps.find((step) => step.id === 'ignore-rule');
    expect(rule.source).toContain('.gitignore');
    expect(rule.line).toBe(1);
    expect(rule.rule).toBe('ignored.txt');
  }, 30000);

  test('traces several paths in one invocation', async () => {
    const { code, stdout } = await runCli([
      'explain',
      'src/index.js',
      'docs/guide.md',
      '--root',
      PROJECT,
      '--format',
      'json',
    ]);

    expect(code).toBe(0);
    expect(JSON.parse(stdout).entries).toHaveLength(2);
  }, 30000);
});

describe('copytree ignore context', () => {
  test('shows the candidate baseline before .copytreeignore', async () => {
    const { code, stdout, stderr } = await runCli(['ignore', 'context', PROJECT]);

    expect(code).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain('# CopyTree ignore-authoring context');
    expect(stdout).toContain('File contents read: **no**');
    expect(stdout).toContain('.copytreeignore NOT applied');
    // The areas an author might exclude have to be visible.
    expect(stdout).toContain('docs/');
    expect(stdout).toContain('tests/');
    expect(stdout).toContain('copytree ignore check .');
  }, 30000);

  test('hints are advisory labels on directories', async () => {
    const { code, stdout } = await runCli(['ignore', 'context', PROJECT, '--format', 'json']);

    expect(code).toBe(0);
    const model = JSON.parse(stdout);

    expect(model.schema).toBe('copytree-ignore-context@1');
    expect(model.contentRead).toBe(false);
    expect(model.directories.find((entry) => entry.path === 'docs/').hint).toBe('documentation');
    expect(model.directories.find((entry) => entry.path === 'tests/').hint).toBe('tests');
    expect(model.nextCommands).toContain('copytree plan .');
  }, 30000);

  test('never emits file contents', async () => {
    const { code, stdout } = await runCli(['ignore', 'context', PROJECT, '--all-paths']);

    // Positive first: a negative assertion against empty output proves nothing.
    expect(code).toBe(0);
    expect(stdout).toContain('# CopyTree ignore-authoring context');
    expect(stdout).toContain('src/index.js');
    expect(stdout).not.toContain('export const a = 1;');
  }, 30000);
});

describe('copytree ignore check', () => {
  const withIgnoreFile = async (contents, args = []) => {
    const target = path.join(PROJECT, '.copytreeignore');
    writeFileSync(target, contents);
    try {
      return await runCli(['ignore', 'check', PROJECT, ...args]);
    } finally {
      rmSync(target, { force: true });
    }
  };

  test('reports the before/after effect', async () => {
    const { code, stdout } = await withIgnoreFile('docs/\n');

    expect(code).toBe(0);
    expect(stdout).toContain('.copytreeignore is valid');
    expect(stdout).toContain('Before .copytreeignore:');
    expect(stdout).toContain('After .copytreeignore:');
    expect(stdout).toContain('docs/');
  }, 30000);

  // Two causes with opposite fixes: a typo, and a rule Git already covers.
  test('tells a typo apart from a redundant rule', async () => {
    const { stdout } = await withIgnoreFile('not-a-real-directory/\ndocs/\n');
    expect(stdout).toContain('matches no path in this project');
    expect(stdout).toContain('RULE_MATCHES_NOTHING');
  }, 30000);

  test('reports a rule Git has already covered as redundant, not as a typo', async () => {
    const { stdout } = await withIgnoreFile('src/\nsrc/\n');
    expect(stdout).toContain('DUPLICATE_RULE');
  }, 30000);

  test('warns when a broad rule takes a package manifest with it', async () => {
    const { stdout } = await withIgnoreFile('*.json\n');
    expect(stdout).toContain('package.json');
    expect(stdout).toContain('CRITICAL_FILE_EXCLUDED');
  }, 30000);

  test('warns when a negation cannot re-include past a pruned parent', async () => {
    const { stdout } = await withIgnoreFile('docs/\n!docs/guide.md\n');
    expect(stdout).toContain('NEGATION_BLOCKED');
    expect(stdout).toContain('Re-include the parent first');
  }, 30000);

  test('--strict turns warnings into a policy failure', async () => {
    const { code } = await withIgnoreFile('not-a-real-directory/\n', ['--strict']);
    expect(code).toBe(3);
  }, 30000);

  test('says what to do when there is no ignore file yet', async () => {
    const { code, stdout } = await runCli(['ignore', 'check', PROJECT]);
    expect(code).toBe(0);
    expect(stdout).toContain('No .copytreeignore in');
    expect(stdout).toContain('copytree ignore init');
  }, 30000);
});

describe('copytree ignore init', () => {
  test('prints by default and writes nothing', async () => {
    const { code, stdout } = await runCli(['ignore', 'init', PROJECT, '--template', 'source']);

    expect(code).toBe(0);
    expect(stdout).toContain('docs/');
    expect(stdout).toContain('tests/');
    // Conventional areas that do not exist are not invented.
    expect(stdout).not.toContain('benchmarks/');
    expect(existsSync(path.join(PROJECT, '.copytreeignore'))).toBe(false);
  }, 30000);

  test('never excludes the package manifest', async () => {
    const { code, stdout } = await runCli(['ignore', 'init', PROJECT, '--template', 'source']);

    expect(code).toBe(0);
    expect(stdout).toContain('docs/');
    expect(stdout).not.toContain('package.json');
  }, 30000);

  test('--write creates the file and validates it', async () => {
    const target = path.join(PROJECT, '.copytreeignore');
    try {
      const { code, stdout } = await runCli([
        'ignore',
        'init',
        PROJECT,
        '--template',
        'source',
        '--write',
      ]);

      expect(code).toBe(0);
      expect(readFileSync(target, 'utf8')).toContain('docs/');
      // Writing runs the same validation as `ignore check` and prints the diff.
      expect(stdout).toContain('Before .copytreeignore:');
    } finally {
      rmSync(target, { force: true });
    }
  }, 30000);

  test('refuses to replace an existing file without --force', async () => {
    const target = path.join(PROJECT, '.copytreeignore');
    writeFileSync(target, '# mine\n');
    try {
      const { code, stderr } = await runCli(['ignore', 'init', PROJECT, '--write']);
      expect(code).toBe(2);
      expect(stderr).toContain('already exists');
      expect(readFileSync(target, 'utf8')).toBe('# mine\n');
    } finally {
      rmSync(target, { force: true });
    }
  }, 30000);
});

describe('help, doctor and completion', () => {
  test('root help costs nothing and names the ignore workflow', async () => {
    const { code, stdout, stderr } = await runCli(['--help']);

    expect(code).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain('copytree ignore context .');
    expect(stdout).toContain('copies a file reference to the clipboard');
  }, 30000);

  test('the machine command schema is versioned and parseable', async () => {
    const { code, stdout } = await runCli(['help', '--format', 'json']);

    expect(code).toBe(0);
    const schema = JSON.parse(stdout);
    expect(schema.schema).toBe('copytree-command-schema@1');
    expect(schema.commands.some((command) => command.id === 'ignore.context')).toBe(true);
  }, 30000);

  test('a bare group lists its subcommands', async () => {
    const { code, stdout } = await runCli(['ignore']);

    expect(code).toBe(0);
    expect(stdout).toContain('ignore context');
    expect(stdout).toContain('ignore check');
    expect(stdout).toContain('ignore init');
  }, 30000);

  test('doctor reports every check and its remediation', async () => {
    const { code, stdout } = await runCli(['doctor', '--format', 'json']);

    expect(code).toBe(0);
    const model = JSON.parse(stdout);
    expect(model.schema).toBe('copytree-doctor@1');

    // The whole stable check set, not a sample of two: a check that silently
    // stops running is exactly what this is meant to notice.
    const names = model.checks.map((check) => check.name);
    for (const expected of [
      'node runtime',
      'installation',
      'configuration',
      'configuration schema',
      'temporary directory',
      'reference directory',
      'cache directory',
      'clipboard file reference',
      'git',
      'gitleaks (optional)',
      'binary and document handling',
      'shell completion',
    ]) {
      expect(names).toContain(expected);
    }

    // Every check that is not a pass owes the reader something to do.
    for (const check of model.checks) {
      if (check.status === 'pass') continue;
      expect(typeof check.remediation).toBe('string');
    }
  }, 30000);

  test('completion is generated for every supported shell', async () => {
    // Each shell has syntax the others do not, so a single generic stub cannot
    // satisfy all four.
    const fingerprints = {
      bash: ['complete -o filenames -F _copytree copytree', 'COMPREPLY'],
      zsh: ['#compdef copytree', '_describe -t commands'],
      fish: ['complete -c copytree', '__fish_seen_subcommand_from'],
      powershell: ['Register-ArgumentCompleter', '$CopyTreeFlags'],
    };

    for (const [shell, markers] of Object.entries(fingerprints)) {
      const { code, stdout } = await runCli(['completion', shell]);
      expect(code).toBe(0);
      for (const marker of markers) expect(stdout).toContain(marker);
    }
  }, 60000);

  test('an unsupported shell is a usage error', async () => {
    const { code, stderr } = await runCli(['completion', 'csh']);
    expect(code).toBe(2);
    expect(stderr).toContain('Unsupported shell');
  }, 30000);
});

describe('stream ownership', () => {
  test('a JSON payload stays parseable while feedback is on stderr', async () => {
    const { code, stdout } = await runCli([SIMPLE, '--stdout', '--format', 'json'], {
      env: { COPYTREE_LOG_LEVEL: 'info' },
    });

    expect(code).toBe(0);
    expect(() => JSON.parse(stdout)).not.toThrow();
  }, 30000);

  test('deprecated spellings warn on stderr and still work', async () => {
    const { code, stdout, stderr } = await runCli([SIMPLE, '--display', '--with-line-numbers'], {
      env: { COPYTREE_LOG_LEVEL: 'info' },
    });

    expect(code).toBe(0);
    expect(stdout).toContain('<?xml');
    expect(stderr).toContain('--display is deprecated; use --stdout');
    expect(stderr).toContain('--with-line-numbers is deprecated; use --line-numbers');
  }, 30000);

  test('a removed option names its replacement instead of "unknown option"', async () => {
    const { code, stderr } = await runCli([SIMPLE, '--max-size', '1MB']);

    expect(code).toBe(2);
    expect(stderr).toContain('--max-size has been removed');
    expect(stderr).toContain('--size-gate');
  }, 30000);
});

describe('content options', () => {
  test('--reproducible produces byte-identical output across runs', async () => {
    const first = await runCli([SIMPLE, '--stdout', '--reproducible']);
    const second = await runCli([SIMPLE, '--stdout', '--reproducible']);

    expect(first.code).toBe(0);
    expect(first.stdout).toBe(second.stdout);
    // The timestamp is the one field guaranteed to differ; it is what is dropped.
    expect(first.stdout).not.toContain('<ct:generated>');
    expect(first.stdout).not.toContain('modified=');
  }, 30000);

  test('--no-metadata strips optional metadata but keeps the schema fields', async () => {
    const { code, stdout } = await runCli([SIMPLE, '--stdout', '--no-metadata']);

    expect(code).toBe(0);
    expect(stdout).toContain('<ct:format>copytree-xml@1</ct:format>');
    expect(stdout).toContain('<ct:fileCount>');
    expect(stdout).not.toContain('modified=');
    expect(stdout).not.toContain('<ct:directoryStructure>');
  }, 30000);

  test('metadata is present by default', async () => {
    const { stdout } = await runCli([SIMPLE, '--stdout']);
    expect(stdout).toContain('modified=');
    expect(stdout).toContain('<ct:directoryStructure>');
  }, 30000);

  test('--no-content keeps the structure and drops the bodies, without changing format', async () => {
    const { code, stdout } = await runCli([SIMPLE, '--stdout', '--no-content']);

    expect(code).toBe(0);
    expect(stdout).toContain('<?xml');
    expect(stdout).toContain('<ct:file path="@index.js"');
    expect(stdout).not.toContain('console.log');
  }, 30000);

  test('--binary states the policy explicitly', async () => {
    const project = mkdtempSync(path.join(os.tmpdir(), 'copytree-binary-'));
    writeFileSync(path.join(project, 'a.js'), 'export const a = 1;\n');
    // Deliberately not a `.png`: media extensions never reach the selection at
    // all — they are excluded from one `stat`, which is the point of
    // extension-first binary handling. `--binary` governs the binaries that do
    // survive, so the fixture has to be one of those.
    writeFileSync(
      path.join(project, 'data.bin'),
      Buffer.from('000102ff fe fd00'.replace(/ /g, ''), 'hex'),
    );

    try {
      const comment = await runCli([project, '--stdout', '--binary', 'comment']);
      const placeholder = await runCli([project, '--stdout', '--binary', 'placeholder']);
      const base64 = await runCli([project, '--stdout', '--binary', 'base64']);

      for (const result of [comment, placeholder, base64]) expect(result.code).toBe(0);

      expect(comment.stdout).toContain('File Excluded: @data.bin');
      expect(placeholder.stdout).toContain('[Binary file not included]');
      expect(base64.stdout).toContain('encoding="base64"');
      // Three policies, three documents: a flag that is stored and ignored
      // would produce one.
      expect(new Set([comment.stdout, placeholder.stdout, base64.stdout]).size).toBe(3);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  }, 30000);

  test('--no-instructions omits the instruction block', async () => {
    const withBlock = await runCli([SIMPLE, '--stdout']);
    const without = await runCli([SIMPLE, '--stdout', '--no-instructions']);

    expect(withBlock.stdout).toContain('<ct:instructions');
    expect(without.stdout).not.toContain('<ct:instructions');
  }, 30000);

  test('streamed and buffered output honour the same content options', async () => {
    const buffered = await runCli([SIMPLE, '--stdout', '--reproducible', '--no-metadata']);
    const streamed = await runCli([SIMPLE, '--stream', '--reproducible', '--no-metadata']);

    expect(buffered.code).toBe(0);
    expect(streamed.code).toBe(0);
    for (const output of [buffered.stdout, streamed.stdout]) {
      expect(output).not.toContain('<ct:generated>');
      expect(output).not.toContain('modified=');
    }
  }, 30000);
});

describe('target resolution', () => {
  // A root is a directory; a file target makes its parent the root and the file
  // a scope entry, so ignore rules and emitted paths stay anchored the way
  // every other run anchors them.
  test('a file target produces a one-file export', async () => {
    const { code, stdout } = await runCli([path.join(SIMPLE, 'index.js'), '--stdout']);

    expect(code).toBe(0);
    expect(stdout).toContain('<ct:fileCount>1</ct:fileCount>');
    expect(stdout).toContain('<ct:file path="@index.js"');
    expect(stdout).not.toContain('<ct:file path="@README.md"');
  }, 30000);

  test('plan agrees with copy on a file target', async () => {
    const { code, stdout } = await runCli([
      'plan',
      path.join(SIMPLE, 'index.js'),
      '--format',
      'json',
    ]);

    expect(code).toBe(0);
    expect(JSON.parse(stdout).entries.map((entry) => entry.path)).toEqual(['index.js']);
  }, 30000);

  test('a missing path fails before any work, with a remediation', async () => {
    const { code, stderr } = await runCli(['./definitely-not-here']);

    expect(code).toBe(2);
    expect(stderr).toContain('Path not found');
  }, 30000);
});

describe('json feedback', () => {
  test('is one versioned object per line on stderr', async () => {
    const { code, stdout, stderr } = await runCli(
      [SIMPLE, '--stdout', '--format', 'json', '--log-format', 'json'],
      { env: { COPYTREE_LOG_LEVEL: 'info' } },
    );

    expect(code).toBe(0);
    // The payload stays parseable while feedback flows on the other stream.
    const payload = JSON.parse(stdout);
    expect(payload.metadata.format).toBe('copytree-json@1');
    expect(payload.files.length).toBeGreaterThan(0);

    const events = stderr
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line));

    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.schema).toBe('copytree-feedback@1');
      expect(typeof event.event).toBe('string');
    }
    expect(events.at(-1).event).toBe('run.complete');
  }, 30000);
});

describe('config migrate', () => {
  test('converts legacy executable configuration into a data file', async () => {
    const legacy = mkdtempSync(path.join(os.tmpdir(), 'copytree-legacy-'));
    const data = mkdtempSync(path.join(os.tmpdir(), 'copytree-data-'));
    writeFileSync(path.join(legacy, 'copytree.json'), '{"includeHidden":true}\n');
    rmSync(path.join(data, ''), { recursive: true, force: true });

    const env = { COPYTREE_LEGACY_CONFIG_PATH: legacy, COPYTREE_DATA_CONFIG_PATH: data };

    try {
      // Prints by default, and writes nothing.
      const preview = await runCli(['config', 'migrate'], { env });
      expect(preview.code).toBe(0);
      expect(preview.stdout).toContain('includeHidden: true');
      expect(existsSync(path.join(data, 'config.yaml'))).toBe(false);

      const written = await runCli(['config', 'migrate', '--write'], { env });
      expect(written.code).toBe(0);
      expect(readFileSync(path.join(data, 'config.yaml'), 'utf8')).toContain('includeHidden: true');
      // The legacy directory is never modified, so a bad migration is undone
      // by deleting one file.
      expect(existsSync(path.join(legacy, 'copytree.json'))).toBe(true);

      const again = await runCli(['config', 'migrate', '--write'], { env });
      expect(again.code).toBe(2);
      expect(again.stderr).toContain('already exists');
    } finally {
      rmSync(legacy, { recursive: true, force: true });
      rmSync(data, { recursive: true, force: true });
    }
  }, 30000);

  test('says so when there is nothing to migrate', async () => {
    const legacy = mkdtempSync(path.join(os.tmpdir(), 'copytree-legacy-empty-'));
    try {
      const { code, stdout } = await runCli(['config', 'migrate'], {
        env: { COPYTREE_LEGACY_CONFIG_PATH: legacy },
      });
      expect(code).toBe(0);
      expect(stdout).toContain('Nothing to migrate');
    } finally {
      rmSync(legacy, { recursive: true, force: true });
    }
  }, 30000);
});

describe('selection engine parity', () => {
  // The secrets guard removes secret-prone paths by filename alone, before any
  // content is read. A plan that skipped that step predicted a set the copy
  // would not produce, which is the one thing a plan may not do.
  test('plan accounts for secret-prone files the copy will drop', async () => {
    const project = mkdtempSync(path.join(os.tmpdir(), 'copytree-secrets-'));
    writeFileSync(path.join(project, 'index.js'), 'export const a = 1;\n');
    writeFileSync(path.join(project, '.env'), 'API_KEY=abcdef\n');

    try {
      const planned = await runCli(['plan', project, '--format', 'json']);
      const copied = await runCli([project, '--stdout', '--format', 'json']);

      const plannedPaths = JSON.parse(planned.stdout).entries.map((entry) => entry.path);
      const copiedPaths = JSON.parse(copied.stdout).files.map((file) => file.path);

      expect(plannedPaths).toEqual(copiedPaths);
      expect(plannedPaths).not.toContain('.env');
      expect(JSON.parse(planned.stdout).exactness.secretExclusion).toBe('exact');
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  }, 30000);

  test('a named profile overlays the automatic one rather than replacing it', async () => {
    const project = mkdtempSync(path.join(os.tmpdir(), 'copytree-profiles-'));
    mkdirSync(path.join(project, 'docs'), { recursive: true });
    mkdirSync(path.join(project, 'src'), { recursive: true });
    writeFileSync(path.join(project, 'src/index.js'), 'export const a = 1;\n');
    writeFileSync(path.join(project, 'docs/guide.md'), '# Guide\n');
    writeFileSync(path.join(project, 'notes.txt'), 'notes\n');
    writeFileSync(path.join(project, '.copytree.yml'), 'exclude:\n  - "docs/"\n');
    writeFileSync(path.join(project, '.copytree-lean.yml'), 'exclude:\n  - "notes.txt"\n');

    try {
      const { code, stdout } = await runCli([
        'plan',
        project,
        '--profile',
        'lean',
        '--format',
        'json',
      ]);

      expect(code).toBe(0);
      const paths = JSON.parse(stdout).entries.map((entry) => entry.path);
      // Both layers' exclusions apply: the automatic profile is not discarded.
      expect(paths).toContain('src/index.js');
      expect(paths).not.toContain('docs/guide.md');
      expect(paths).not.toContain('notes.txt');
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  }, 30000);

  test('a profile rejects an unknown key, naming the file and the field', async () => {
    const project = mkdtempSync(path.join(os.tmpdir(), 'copytree-badprofile-'));
    writeFileSync(path.join(project, 'a.js'), 'a\n');
    writeFileSync(path.join(project, '.copytree-typo.yml'), 'excludes:\n  - "docs/"\n');

    try {
      const { code, stderr } = await runCli(['plan', project, '--profile', 'typo']);
      expect(code).toBe(2);
      expect(stderr).toContain('excludes');
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  }, 30000);

  test('a profile can set the output format, and --format still wins', async () => {
    const project = mkdtempSync(path.join(os.tmpdir(), 'copytree-pformat-'));
    writeFileSync(path.join(project, 'a.js'), 'a\n');
    writeFileSync(path.join(project, '.copytree.yml'), 'options:\n  format: markdown\n');

    try {
      const fromProfile = await runCli([project, '--stdout']);
      expect(fromProfile.stdout).toContain('format: copytree-md@1');

      const fromFlag = await runCli([project, '--stdout', '--format', 'xml']);
      expect(fromFlag.stdout).toContain('<?xml');
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  }, 30000);

  test('--include narrows force-included files too', async () => {
    const project = mkdtempSync(path.join(os.tmpdir(), 'copytree-forced-'));
    writeFileSync(path.join(project, 'a.js'), 'a\n');
    writeFileSync(path.join(project, 'b.md'), 'b\n');

    try {
      const { code, stdout } = await runCli([
        'plan',
        project,
        '--force-include',
        'b.md',
        '--include',
        '**/*.js',
        '--format',
        'json',
      ]);

      expect(code).toBe(0);
      // Force-include overrides exclusions, not the caller's own narrowing.
      expect(JSON.parse(stdout).entries.map((entry) => entry.path)).toEqual(['a.js']);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  }, 30000);
});

describe('exit codes', () => {
  test('a policy check that fails exits 3', async () => {
    const { code } = await runCli([SIMPLE, '--include', '**/*.none', '--fail-empty', '--stdout']);
    expect(code).toBe(3);
  }, 30000);

  test('a Git selector that cannot be applied exits 1', async () => {
    const project = mkdtempSync(path.join(os.tmpdir(), 'copytree-nogit-'));
    writeFileSync(path.join(project, 'a.js'), 'a\n');
    try {
      const { code, stderr } = await runCli([project, '--modified', '--stdout']);
      expect(code).toBe(1);
      expect(stderr).toContain('Git selection failed');
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  }, 30000);

  test('a usage error exits 2', async () => {
    const { code } = await runCli([SIMPLE, '--max-files', 'banana']);
    expect(code).toBe(2);
  }, 30000);
});

describe('ignore attribution', () => {
  // Crediting a profile's or a budget's removals to an ignore rule is how
  // someone deletes the wrong line trying to get a file back.
  test('separates what .copytreeignore removed from what everything else did', async () => {
    const project = mkdtempSync(path.join(os.tmpdir(), 'copytree-attrib-'));
    mkdirSync(path.join(project, 'docs'), { recursive: true });
    mkdirSync(path.join(project, 'src'), { recursive: true });
    writeFileSync(path.join(project, 'docs/a.md'), 'a\n');
    writeFileSync(path.join(project, 'src/b.js'), 'b\n');
    writeFileSync(path.join(project, '.copytreeignore'), 'docs/\n');
    writeFileSync(path.join(project, '.copytree.yml'), 'exclude:\n  - "src/"\n');

    try {
      const { code, stdout } = await runCli(['ignore', 'check', project, '--format', 'json']);

      expect(code).toBe(0);
      const model = JSON.parse(stdout);
      // `docs/a.md` is the ignore file's doing; `src/b.js` is the profile's.
      expect(model.removed.files).toBe(1);
      expect(model.removedByOthers.files).toBe(1);
      expect(model.before.files - model.removed.files - model.removedByOthers.files).toBe(
        model.effective.files,
      );
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  }, 30000);
});

describe('content-free modes still apply safety policy', () => {
  // A tree or a structure-only export has nowhere to put a file body, but it
  // still names every path. Skipping the secret policy there put `.env` in the
  // structure of a document `plan` had already predicted without it.
  test.each([
    ['--format tree', ['--format', 'tree']],
    ['--no-content', ['--no-content']],
  ])(
    '%s excludes secret-prone paths, as plan predicts',
    async (_name, args) => {
      const project = mkdtempSync(path.join(os.tmpdir(), 'copytree-safety-'));
      writeFileSync(path.join(project, 'index.js'), 'export const a = 1;\n');
      writeFileSync(path.join(project, '.env'), 'API_KEY=abcdef\n');

      try {
        const copied = await runCli([project, '--stdout', ...args]);
        const planned = await runCli(['plan', project, '--format', 'json']);

        expect(copied.code).toBe(0);
        expect(copied.stdout).not.toContain('.env');
        expect(JSON.parse(planned.stdout).entries.map((entry) => entry.path)).toEqual(['index.js']);
      } finally {
        rmSync(project, { recursive: true, force: true });
      }
    },
    30000,
  );
});

describe('profile diagnostics', () => {
  test('a broken auto-discovered profile is reported, not swallowed', async () => {
    const project = mkdtempSync(path.join(os.tmpdir(), 'copytree-badauto-'));
    writeFileSync(path.join(project, 'a.js'), 'a\n');
    writeFileSync(path.join(project, '.copytree.yml'), 'options:\n  fromat: xml\n');

    try {
      const { code, stderr } = await runCli(['plan', project], {
        env: { COPYTREE_LOG_LEVEL: 'info' },
      });

      // The project is still copyable; the author is still told their rules
      // are not in force.
      expect(code).toBe(0);
      expect(stderr).toContain('Unknown profile option');
      expect(stderr).toContain('fromat');
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  }, 30000);

  test('a profile can choose a content-free format without loading content', async () => {
    const project = mkdtempSync(path.join(os.tmpdir(), 'copytree-treeprofile-'));
    writeFileSync(path.join(project, 'a.js'), 'const secret = 1;\n');
    writeFileSync(path.join(project, '.copytree.yml'), 'options:\n  format: tree\n');

    try {
      const { code, stdout } = await runCli([project, '--stdout']);
      expect(code).toBe(0);
      expect(stdout).toContain('a.js');
      expect(stdout).not.toContain('const secret');
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  }, 30000);
});

describe('profile diagnostics reach every command', () => {
  test.each([
    ['plan', ['plan']],
    ['inspect', ['inspect']],
    ['ignore check', ['ignore', 'check']],
    ['ignore context', ['ignore', 'context']],
  ])(
    '%s reports a profile it had to reject',
    async (_name, command) => {
      const project = mkdtempSync(path.join(os.tmpdir(), 'copytree-warn-'));
      writeFileSync(path.join(project, 'a.js'), 'a\n');
      writeFileSync(path.join(project, '.copytree.yml'), 'options:\n  fromat: xml\n');

      try {
        const { code, stderr } = await runCli([...command, project], {
          env: { COPYTREE_LOG_LEVEL: 'info' },
        });

        expect(code).toBe(0);
        expect(stderr).toContain('Unknown profile option');
      } finally {
        rmSync(project, { recursive: true, force: true });
      }
    },
    30000,
  );
});

describe('feedback options are implemented, not merely accepted', () => {
  test.each([
    ['plan', ['plan', '.']],
    ['inspect', ['inspect', '.']],
    ['ignore check', ['ignore', 'check', '.']],
    ['ignore context', ['ignore', 'context', '.']],
    ['config validate', ['config', 'validate']],
    ['cache status', ['cache', 'status']],
    ['doctor', ['doctor']],
    ['completion', ['completion', 'zsh']],
  ])(
    '%s says more with --verbose and nothing with --quiet',
    async (_name, command) => {
      const speaking = { env: { COPYTREE_LOG_LEVEL: 'info' } };

      const verbose = await runCli([...command, '--verbose'], speaking);
      const quiet = await runCli([...command, '--quiet'], speaking);

      expect(verbose.stderr.length).toBeGreaterThan(0);
      expect(quiet.stderr).toBe('');
    },
    60000,
  );
});

describe('option errors name the values this command accepts', () => {
  // `--format` means `xml|markdown|…` on copy and `text|json|ndjson` on plan.
  test('plan rejects an unknown format with the plan formats', async () => {
    const { code, stderr } = await runCli(['plan', SIMPLE, '--format', 'nope']);

    expect(code).toBe(2);
    expect(stderr).toContain('Choose text, json or ndjson');
    expect(stderr).not.toContain('sarif');
  }, 30000);

  test('copy rejects an unknown format with the document formats', async () => {
    const { code, stderr } = await runCli([SIMPLE, '--format', 'nope']);

    expect(code).toBe(2);
    expect(stderr).toContain('Choose xml, markdown, json, ndjson, sarif or tree');
  }, 30000);
});

describe('force-include boundaries', () => {
  // Force inclusion overrides ordinary exclusions. It does not override the
  // scope: the caller asked for a subtree, and dragging a file in from outside
  // it would answer a question nobody asked.
  test('a force-include outside the scope does not drag the file in', async () => {
    const project = mkdtempSync(path.join(os.tmpdir(), 'copytree-forcescope-'));
    mkdirSync(path.join(project, 'src'), { recursive: true });
    writeFileSync(path.join(project, 'src/keep.js'), 'export const a = 1;\n');
    writeFileSync(path.join(project, 'src/ignored.log'), 'in scope, gitignored\n');
    writeFileSync(path.join(project, 'outside.log'), 'out of scope\n');
    writeFileSync(path.join(project, '.gitignore'), '*.log\n');

    try {
      const { code, stdout } = await runCli([
        'plan',
        project,
        '--scope',
        'src',
        '--force-include',
        '**/*.log',
        '--format',
        'json',
      ]);

      expect(code).toBe(0);
      const paths = JSON.parse(stdout).entries.map((entry) => entry.path);

      expect(paths).toContain('src/keep.js');
      // Force-include beats .gitignore...
      expect(paths).toContain('src/ignored.log');
      // ...but not the scope.
      expect(paths).not.toContain('outside.log');
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  }, 30000);

  test('a scope outside the project is a usage error', async () => {
    const { code, stdout, stderr } = await runCli(['plan', SIMPLE, '--scope', '../..']);

    expect(code).toBe(2);
    expect(stdout).toBe('');
    expect(stderr).toContain('[ERR_SCOPE_OUTSIDE_ROOT]');
  }, 30000);
});

describe('ignore init --force', () => {
  test('replaces an existing file only with --force, and validates what it wrote', async () => {
    const project = mkdtempSync(path.join(os.tmpdir(), 'copytree-initforce-'));
    mkdirSync(path.join(project, 'docs'), { recursive: true });
    writeFileSync(path.join(project, 'docs/a.md'), '# a\n');
    writeFileSync(path.join(project, 'index.js'), 'export const a = 1;\n');

    const target = path.join(project, '.copytreeignore');
    writeFileSync(target, '# mine\n');

    try {
      const { code, stdout } = await runCli([
        'ignore',
        'init',
        project,
        '--template',
        'source',
        '--write',
        '--force',
      ]);

      expect(code).toBe(0);
      const written = readFileSync(target, 'utf8');
      expect(written).toContain('docs/');
      expect(written).not.toContain('# mine');
      // Writing runs the same validation as `ignore check`, and says what the
      // file it just wrote actually does.
      expect(stdout).toContain('Before .copytreeignore:');
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  }, 30000);
});

describe('explain edge cases', () => {
  test('a path that does not exist is explained, not an error', async () => {
    const { code, stdout } = await runCli([
      'explain',
      'no/such/file.js',
      '--root',
      SIMPLE,
      '--format',
      'json',
    ]);

    expect(code).toBe(0);
    const [entry] = JSON.parse(stdout).entries;
    expect(entry.decision).toBe('excluded');
    expect(entry.reason).toBe('pathNotFound');
    expect(entry.steps.find((step) => step.id === 'exists').verdict).toBe('fail');
  }, 30000);

  // `..draft` is a legitimate directory name; only `..` and `../` escape.
  test('a directory whose name begins with two dots is inside the root', async () => {
    const project = mkdtempSync(path.join(os.tmpdir(), 'copytree-dotdot-'));
    mkdirSync(path.join(project, '..draft'), { recursive: true });
    writeFileSync(path.join(project, '..draft', 'note.js'), 'export const a = 1;\n');

    try {
      const { code, stdout } = await runCli([
        'explain',
        '..draft/note.js',
        '--root',
        project,
        '--format',
        'json',
      ]);

      expect(code).toBe(0);
      const [entry] = JSON.parse(stdout).entries;
      expect(entry.steps.find((step) => step.id === 'root-containment').verdict).toBe('pass');
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  }, 30000);
});
