/**
 * The command-schema contract.
 *
 * These are the static checks section 21.3 of the CLI specification asks for:
 * an option that is declared but never read is a lie told in help, and code
 * that reads an option nobody declared is a flag users cannot discover. Both
 * used to exist, which is why they are tested rather than reviewed.
 */

import path from 'path';
import { readFileSync, readdirSync, statSync } from 'fs';
import {
  COMMANDS,
  COMMAND_GROUPS,
  commandById,
  commandByPath,
  deprecationTable,
  longFlagOf,
  optionsOf,
  reservedCommandTokens,
  subcommandsOf,
} from '../../../src/cli/schema.js';
import { commandSchemaJson, renderCommandHelp, renderRootHelp } from '../../../src/cli/help.js';
import { generateCompletion } from '../../../src/cli/completion.js';
import { SHELLS } from '../../../src/cli/schema.js';

const ROOT = path.resolve(process.cwd());

/**
 * The modules that *generate* the CLI from the schema rather than consuming it.
 *
 * Excluded from the corpus below, and `schema.js` most of all: every option id
 * necessarily appears in its own declaration, so a corpus containing it makes
 * the "is this option read" check answer yes for every option — including ones
 * no handler has ever looked at. That is the exact defect the check exists to
 * catch, so including these files would make the test unable to fail.
 */
const GENERATORS = new Set(
  ['schema.js', 'help.js', 'docs.js', 'completion.js', 'program.js'].map((name) =>
    path.join(ROOT, 'src', 'cli', name),
  ),
);

/** Every source file that could plausibly read a canonical option. */
function sourceFiles(dir = path.join(ROOT, 'src')) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...sourceFiles(full));
    } else if (entry.endsWith('.js') && !GENERATORS.has(full)) {
      files.push(full);
    }
  }
  return files;
}

// Every path, read as a path. The previous form mixed paths and already-read
// contents in one array and told them apart with `startsWith('/')`, which on
// Windows treats `C:\...` as source text and silently drops the file.
const CONSUMER_FILES = [...sourceFiles(), path.join(ROOT, 'bin/copytree.js')];
const SOURCE = CONSUMER_FILES.map((file) => readFileSync(file, 'utf8')).join('\n');

describe('command schema', () => {
  test('every command has a unique id and path', () => {
    const ids = COMMANDS.map((command) => command.id);
    const paths = COMMANDS.map((command) => command.path.join(' '));
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  test('exactly one command is the default', () => {
    expect(COMMANDS.filter((command) => command.isDefault === true)).toHaveLength(1);
  });

  test('every option id is unique within its command', () => {
    for (const command of COMMANDS) {
      const ids = optionsOf(command).map((option) => option.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  test('every option has a description, a visibility and a flag string', () => {
    for (const command of COMMANDS) {
      for (const option of optionsOf(command)) {
        expect(typeof option.description).toBe('string');
        expect(option.description.length).toBeGreaterThan(0);
        expect(['common', 'advanced', 'hidden']).toContain(option.visibility);
        expect(option.flags).toMatch(/^-/);
      }
    }
  });

  test('every enum option declares its values', () => {
    for (const command of COMMANDS) {
      for (const option of optionsOf(command)) {
        if (option.value !== 'enum') continue;
        expect(Array.isArray(option.enumValues)).toBe(true);
        expect(option.enumValues.length).toBeGreaterThan(1);
      }
    }
  });

  test('conflicts and requires name options that exist on the same command', () => {
    for (const command of COMMANDS) {
      const ids = new Set(optionsOf(command).map((option) => option.id));
      for (const option of optionsOf(command)) {
        for (const other of [...(option.conflicts || []), ...(option.requires || [])]) {
          expect(ids.has(other)).toBe(true);
        }
      }
    }
  });

  test('conflicts are declared symmetrically', () => {
    for (const command of COMMANDS) {
      const byId = new Map(optionsOf(command).map((option) => [option.id, option]));
      for (const option of optionsOf(command)) {
        for (const other of option.conflicts || []) {
          expect(byId.get(other).conflicts ?? []).toContain(option.id);
        }
      }
    }
  });

  test('every deprecated option names its replacement', () => {
    for (const row of deprecationTable()) {
      expect(row.replacedBy).toBeTruthy();
      expect(row.flag).toMatch(/^--/);
    }
  });

  test('deprecated options are hidden from help', () => {
    for (const command of COMMANDS) {
      for (const option of optionsOf(command)) {
        if (!option.replacedBy) continue;
        expect(option.visibility).toBe('hidden');
      }
    }
  });

  // A canonical option that no handler reads is a flag that silently does
  // nothing — the exact defect this specification was written to remove.
  // A guard on the guard: if the corpus ever stops excluding the generators,
  // this fails rather than the check silently becoming a tautology.
  test('the read-check corpus excludes the modules that generate the CLI', () => {
    const leaked = CONSUMER_FILES.filter((file) =>
      readFileSync(file, 'utf8').includes('COMMAND_SCHEMA_VERSION ='),
    ).map((file) => path.relative(ROOT, file));

    expect(leaked).toEqual([]);
    // ...and the corpus is not empty, which would make the check vacuous the
    // other way.
    expect(SOURCE).toContain('request.selection.forceIncludes');
  });

  test('every canonical option id is read somewhere in the source', () => {
    const unread = [];
    for (const command of COMMANDS) {
      for (const option of optionsOf(command)) {
        if (option.visibility === 'hidden') continue;
        // Negated pairs arrive on the positive key, so the negative id is a
        // help-and-docs entry rather than a value anyone reads.
        if (/^no[A-Z]/.test(option.id)) continue;
        if (!SOURCE.includes(option.id)) unread.push(`${command.id}:${option.id}`);
      }
    }
    expect(unread).toEqual([]);
  });

  test('every command declares a handler module', () => {
    for (const command of COMMANDS) {
      expect(typeof command.handler).toBe('string');
    }
  });

  test('lookup helpers agree with the declarations', () => {
    for (const command of COMMANDS) {
      expect(commandById(command.id)).toBe(command);
      expect(commandByPath(command.path)).toBe(command);
    }
  });

  test('reserved tokens cover every command and group', () => {
    const reserved = reservedCommandTokens();
    for (const command of COMMANDS) expect(reserved.has(command.path[0])).toBe(true);
    for (const group of Object.keys(COMMAND_GROUPS)) {
      if (subcommandsOf(group).length > 0) expect(reserved.has(group)).toBe(true);
    }
  });
});

describe('help rendering', () => {
  test('root help fits one screen and leads with the default behaviour', () => {
    const help = renderRootHelp();
    const lines = help.split('\n');

    expect(lines.length).toBeLessThanOrEqual(50);
    expect(help).toContain('copies a file reference to the clipboard');
    // The ignore-authoring workflow has to be discoverable from root help alone.
    expect(help).toContain('copytree ignore context .');
    expect(help).toContain('copytree ignore check .');
    expect(help).toContain('copytree plan .');
  });

  // The root command list was hardcoded once, and drifted the moment a command
  // was added: `config migrate` existed for a day without appearing anywhere a
  // reader would look. It is derived now, and this is what keeps it derived.
  test('root help reaches every command in the schema', () => {
    const help = renderRootHelp();

    for (const command of COMMANDS) {
      if (command.hidden || command.rootHelp === false) continue;

      const [parent] = command.path;
      const group = COMMAND_GROUPS[parent];

      if (group?.collapse && subcommandsOf(parent).length > 0) {
        // Collapsed groups name every subcommand in one row.
        expect(help).toContain(
          `${parent} ${subcommandsOf(parent)
            .map((c) => c.path.at(-1))
            .join('|')}`,
        );
      } else {
        expect(help).toContain(command.path.join(' '));
      }
    }
  });

  test('a command excluded from root help is reachable another way', () => {
    for (const command of COMMANDS) {
      if (command.rootHelp !== false) continue;
      // `help` is not listed as a row, but the footer says how to reach it.
      expect(renderRootHelp()).toContain(`copytree ${command.path[0]} --format json`);
    }
  });

  test('root help shows no deprecated spellings', () => {
    const help = renderRootHelp();
    for (const row of deprecationTable()) {
      expect(help).not.toContain(`${row.flag} `);
    }
  });

  test('root help contains no ANSI escapes', () => {
    // eslint-disable-next-line no-control-regex
    expect(renderRootHelp()).not.toMatch(/\[/);
  });

  test('command help lists every non-hidden option, and only those', () => {
    for (const command of COMMANDS) {
      const help = renderCommandHelp(command, { all: true });
      for (const option of optionsOf(command)) {
        if (option.visibility === 'hidden') {
          expect(help).not.toContain(option.flags);
        } else {
          expect(help).toContain(option.flags);
        }
      }
    }
  });

  test('default command help hides advanced options until asked', () => {
    const copy = commandById('copy');
    const brief = renderCommandHelp(copy, { all: false });
    const full = renderCommandHelp(copy, { all: true });

    // Chosen so the assertion is about the option list rather than the
    // conflicts footer, which legitimately names --reveal.
    const advanced = optionsOf(copy).find(
      (option) =>
        option.visibility === 'advanced' &&
        !(copy.conflicts || []).join(' ').includes(longFlagOf(option)),
    );
    expect(brief).not.toContain(advanced.flags);
    expect(full).toContain(advanced.flags);
    expect(brief).toContain('--help-all');
  });

  test('help is deterministic', () => {
    expect(renderRootHelp()).toBe(renderRootHelp());
    for (const command of COMMANDS) {
      expect(renderCommandHelp(command)).toBe(renderCommandHelp(command));
    }
  });
});

describe('machine command schema', () => {
  test('is versioned and covers every visible command', () => {
    const schema = commandSchemaJson();
    expect(schema.schema).toBe('copytree-command-schema@1');
    expect(schema.commands).toHaveLength(COMMANDS.filter((command) => !command.hidden).length);
  });

  test('omits deprecated options by default and includes them on request', () => {
    const visible = commandSchemaJson();
    const everything = commandSchemaJson({ includeHidden: true });

    const flatten = (schema) =>
      schema.commands.flatMap((command) =>
        command.optionGroups.flatMap((group) => group.options.map((option) => option.id)),
      );

    expect(flatten(visible)).not.toContain('display');
    expect(flatten(everything)).toContain('display');
  });

  test('serializes cleanly to JSON', () => {
    expect(() => JSON.stringify(commandSchemaJson())).not.toThrow();
  });
});

describe('shell completion', () => {
  test.each(SHELLS)('generates %s completion from the schema', (shell) => {
    const script = generateCompletion(shell);
    expect(script.length).toBeGreaterThan(100);
    // Every top-level command should be completable.
    for (const command of COMMANDS) {
      if (command.hidden) continue;
      expect(script).toContain(command.path[0]);
    }
  });

  test('offers no deprecated flags', () => {
    // A flag can be deprecated on one command and canonical on another —
    // `--explain` is a copy deprecation and a `plan` option — so only the ones
    // that are deprecated everywhere may never be suggested.
    const canonical = new Set(
      COMMANDS.flatMap((command) =>
        optionsOf(command)
          .filter((option) => option.visibility !== 'hidden')
          .map((option) => longFlagOf(option)),
      ),
    );

    for (const shell of SHELLS) {
      const script = generateCompletion(shell);
      for (const row of deprecationTable()) {
        if (canonical.has(row.flag)) continue;
        expect(script.includes(`'${row.flag}'`)).toBe(false);
      }
    }
  });

  test('rejects an unsupported shell', () => {
    expect(() => generateCompletion('csh')).toThrow(/Unsupported shell/);
  });
});

describe('long flag extraction', () => {
  test('finds the long form of every option', () => {
    for (const command of COMMANDS) {
      for (const option of optionsOf(command)) {
        expect(longFlagOf(option)).toMatch(/^--/);
      }
    }
  });
});

describe('generated documentation', () => {
  test('docs/cli/copytree-reference.md matches the command schema', async () => {
    const { renderReference } = await import('../../../src/cli/docs.js');
    const onDisk = readFileSync(path.join(ROOT, 'docs/cli/copytree-reference.md'), 'utf8');

    // Documentation drift is a build failure, not a review finding.
    expect(onDisk).toBe(renderReference());
  });

  // The drift check compares the file with the generator, so a generator bug
  // survives it: regenerate, both agree, and the reference reads
  // "[object Object]". This is the check on the generator itself.
  test('the reference renders no placeholder or undefined text', async () => {
    const { renderReference } = await import('../../../src/cli/docs.js');
    const reference = renderReference();

    expect(reference).not.toContain('[object Object]');
    expect(reference).not.toContain('undefined');
    for (const parent of Object.keys(COMMAND_GROUPS)) {
      if (subcommandsOf(parent).length === 0) continue;
      expect(reference).toContain(COMMAND_GROUPS[parent].summary);
    }
  });

  test('the reference documents every visible command and no hidden one', async () => {
    const { renderReference } = await import('../../../src/cli/docs.js');
    const reference = renderReference();

    for (const command of COMMANDS) {
      if (command.hidden) continue;
      expect(reference).toContain(`## \`copytree ${command.path.join(' ')}\``);
    }
  });
});

describe('error-message standard', () => {
  test('every failure carries a stable code, including an unclassified one', async () => {
    const { buildFailureModel } = await import('../../../src/ui/feedback/model.js');
    const { describeError, ERROR_CODES, ValidationError } =
      await import('../../../src/utils/errors.js');

    const typed = buildFailureModel(
      describeError(
        new ValidationError('Invalid --max-files value', 'max-files', 'banana', {
          code: ERROR_CODES.INVALID_OPTION,
          suggestion: 'Use a whole number of 1 or more',
        }),
      ),
    );
    expect(typed.notes.at(-1)).toBe('[ERR_INVALID_OPTION]');

    // An unclassified failure is exactly the case where an issue report needs a
    // code most, so it gets one rather than being the single exception.
    const untyped = buildFailureModel(describeError(new Error('something gave way')));
    expect(untyped.notes.at(-1)).toBe('[UNKNOWN_ERROR]');
  });

  test('a Git failure reports one line, not the whole advice block', async () => {
    const { describeError, GitError } = await import('../../../src/utils/errors.js');

    const description = describeError(
      new GitError(
        "fatal: bad revision\nUse '--' to separate paths from revisions",
        'getChangedFiles',
      ),
    );

    expect(description.subject).toBe('fatal: bad revision');
    expect(description.suggestion).toBeTruthy();
    expect(description.code).toBe('GIT_ERROR');
  });
});

describe('generated shell completion', () => {
  test('offers the enum values of the command actually being completed', async () => {
    for (const shell of ['bash', 'powershell']) {
      const script = generateCompletion(shell);
      // `--format` means different things on `copy` and on `plan`, and offering
      // the wrong set is worse than offering none.
      expect(script).toContain('copy|--format');
      expect(script).toContain('plan|--format');
    }
  });
});
