/**
 * The architecture guide's fatal-stage table, checked against the stages.
 *
 * That table is the answer to "will this failure be reported, or silently
 * skipped?", which is the question someone asks when a run came back
 * successful and wrong. It had drifted badly: it named four fatal stages when
 * there were eleven, and described `SortFilesStage` and `BudgetStage` as
 * degrading gracefully — after both had been made fatal precisely because
 * degrading gracefully was the bug. Someone reading it to decide whether a
 * budget could quietly disengage would have concluded, correctly per the
 * document and incorrectly per the code, that it could.
 *
 * A table maintained by hand drifts again. This makes that a failing test.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { stripCommentLines } from '../../helpers/sourceScan.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const stagesDir = path.join(repoRoot, 'src/pipeline/stages');
const guide = fs.readFileSync(path.join(repoRoot, 'docs/technical/architecture.md'), 'utf8');

/**
 * What each stage's source says about its own fatality.
 *
 * Read from the source rather than by constructing every stage: several need a
 * configuration, a base path or a Git repository to build, and the assertion is
 * about a declaration, not about behaviour under load.
 *
 * @returns {Map<string, 'yes'|'no'|'conditional'>} Fatality by stage name
 */
function declaredFatality() {
  const fatality = new Map();

  for (const file of fs.readdirSync(stagesDir)) {
    if (!file.endsWith('.js')) continue;

    // Comments stripped: a paragraph explaining why a stage is not fatal
    // contains the words that decide whether this test thinks it is.
    const source = stripCommentLines(fs.readFileSync(path.join(stagesDir, file), 'utf8'));
    const name = path.basename(file, '.js');

    // A bare `this.fatal = true` is unconditional. Anything else that assigns
    // it — a ternary, an expression, an assignment inside a branch — is
    // conditional, including `if (named) this.fatal = true`, which a looser
    // match reads as unconditional.
    const assignments = [...source.matchAll(/this\.fatal\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
    const branched = /\bif\s*\([^)]*\)\s*this\.fatal\s*=/.test(source);

    if (assignments.length === 0) fatality.set(name, 'no');
    else if (!branched && assignments.every((value) => value === 'true')) {
      fatality.set(name, 'yes');
    } else if (assignments.every((value) => value === 'false')) fatality.set(name, 'no');
    else fatality.set(name, 'conditional');
  }

  return fatality;
}

/**
 * The table as the guide states it.
 * @returns {Map<string, string>} Fatality by stage name, per the document
 */
function documentedFatality() {
  // Scoped to the table, by markers in the document. Scanning the whole guide
  // would pick up any row anywhere that happened to match, and silently let the
  // last duplicate win.
  const table = guide.match(
    /<!-- fatal-stage-table:start -->([\s\S]*?)<!-- fatal-stage-table:end -->/,
  );

  if (!table) throw new Error('The fatal-stage table markers are missing from architecture.md');

  const documented = new Map();

  for (const match of table[1].matchAll(/^\| `(\w+Stage)`\s*\|\s*(yes|no|conditional)\s*\|/gm)) {
    if (documented.has(match[1])) {
      throw new Error(`${match[1]} appears twice in the fatal-stage table`);
    }
    documented.set(match[1], match[2]);
  }

  return documented;
}

describe('the fatal-stage table', () => {
  const declared = declaredFatality();
  const documented = documentedFatality();

  it('parses, so a formatting change cannot make this test vacuous', () => {
    expect(documented.size).toBeGreaterThan(8);
  });

  it('lists every stage that exists', () => {
    const missing = [...declared.keys()].filter((name) => !documented.has(name));

    // A stage absent from the table is one whose failure behaviour nobody has
    // written down.
    expect(missing).toEqual([]);
  });

  it('lists no stage that does not exist', () => {
    const phantom = [...documented.keys()].filter((name) => !declared.has(name));

    expect(phantom).toEqual([]);
  });

  it.each([...declared.entries()])('describes %s as %s', (name, fatality) => {
    expect({ name, documented: documented.get(name) }).toEqual({ name, documented: fatality });
  });

  it('keeps the budget stages fatal', () => {
    // Named individually because these are the ones that were recoverable, and
    // the reason each was changed: a budget that disengages exactly when the
    // code enforcing it is already in an unexpected state is worse than no
    // budget, because the caller believes it held.
    for (const stage of ['BudgetStage', 'CharLimitStage', 'SortFilesStage']) {
      expect({ stage, fatal: declared.get(stage) }).toEqual({ stage, fatal: 'yes' });
    }
  });

  it('keeps the secrets guard fatal', () => {
    // Skipping it emits unredacted credentials with a success exit code.
    expect(declared.get('SecretsGuardStage')).toBe('yes');
  });
});

/**
 * The two conditional stages, exercised rather than read.
 *
 * "Declared in source" is a proxy for "fatal at runtime", and for a stage that
 * decides per run it is a poor one — `InstructionsStage` sets the flag from its
 * input, which no amount of reading the constructor would reveal.
 */
describe('conditional fatality, at runtime', () => {
  it('is fatal for an instructions block the caller named', async () => {
    const { default: InstructionsStage } =
      await import('../../../src/pipeline/stages/InstructionsStage.js');

    const stage = new InstructionsStage();
    await stage
      .process({ files: [], options: { instructions: 'no-such-block' } })
      .catch(() => undefined);

    // A document missing the instructions the caller believes are in it is not
    // the document they asked for.
    expect(stage.fatal).toBe(true);
  });

  it('is recoverable for the configured default block', async () => {
    const { default: InstructionsStage } =
      await import('../../../src/pipeline/stages/InstructionsStage.js');

    const stage = new InstructionsStage();
    await stage.process({ files: [], options: {} }).catch(() => undefined);

    expect(stage.fatal).toBe(false);
  });

  it('is fatal for a Git selector and recoverable for a status annotation', async () => {
    const { default: GitFilterStage } =
      await import('../../../src/pipeline/stages/GitFilterStage.js');

    // A selector that cannot run would silently copy the whole repository.
    expect(new GitFilterStage({ modified: true }).fatal).toBe(true);
    expect(new GitFilterStage({ changed: 'main' }).fatal).toBe(true);
    // An annotation that fails changes nothing about the selection.
    expect(new GitFilterStage({ withGitStatus: true }).fatal).toBe(false);
  });
});
