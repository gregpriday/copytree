/**
 * The stage lifecycle is a contract, not decoration.
 *
 * `onInit`, `beforeRun` and `validate` all run *before* `process()` has
 * produced anything, so a failure in any of them can change what the output
 * is. All three used to be logged as warnings and stepped over — and the worst
 * of the three was validation, which under `continueOnError` warned and then
 * called `process()` with the very input it had just declared invalid. A
 * validator that cannot stop the thing it validates is a logging function.
 *
 * `afterRun` is the one hook that is not fatal, and the line is principled
 * rather than pragmatic: it runs after the output exists, so nothing it does
 * can change what that output contains. It is still recorded, because "not
 * fatal" and "not worth mentioning" are different claims.
 */

import Pipeline from '../../../src/pipeline/Pipeline.js';
import Stage from '../../../src/pipeline/Stage.js';
import { ValidationError } from '../../../src/utils/errors.js';

jest.unmock('../../../src/utils/fsx.js');

/** Records that it ran, so a test can prove it did not. */
class MarkerStage extends Stage {
  async process(input) {
    return { ...input, reachedMarker: true };
  }
}

/** Fails in whichever lifecycle hook it is told to. */
class HookFailureStage extends Stage {
  constructor(hook) {
    super({});
    this.hook = hook;
    this.processed = false;

    this[hook] = async () => {
      throw new Error(`${hook} exploded`);
    };
  }

  async process(input) {
    this.processed = true;
    return input;
  }
}

describe('lifecycle hook failure policy', () => {
  // `continueOnError: true` throughout: this is what every production pipeline
  // sets, and the point is that it must not rescue a broken precondition.
  const build = (stage) => {
    const pipeline = new Pipeline({ continueOnError: true, config: null });
    pipeline.through([stage, new MarkerStage()]);
    return pipeline;
  };

  test.each(['onInit', 'beforeRun'])('a failed %s hook fails the run', async (hook) => {
    const stage = new HookFailureStage(hook);

    await expect(build(stage).process({ files: [] })).rejects.toThrow(`${hook} exploded`);
    expect(stage.processed).toBe(false);
  });

  test('a failed validate() guarantees process() is never called', async () => {
    const stage = new HookFailureStage('validate');

    await expect(build(stage).process({ files: [] })).rejects.toThrow(ValidationError);
    expect(stage.processed).toBe(false);
  });

  test('a failed afterRun hook keeps the output and records a degradation', async () => {
    const stage = new HookFailureStage('afterRun');

    const result = await build(stage).process({ files: [] });

    // The output is correct — `process()` already produced it — so discarding
    // it over a metrics hook would be the wrong trade. Saying nothing would
    // also be wrong.
    expect(stage.processed).toBe(true);
    expect(result.reachedMarker).toBe(true);
    expect(result.stats.degradations).toEqual([
      expect.objectContaining({ code: 'STAGE_AFTER_RUN_FAILED' }),
    ]);
  });
});

describe('pipeline immutability', () => {
  test('stages cannot be added after the pipeline has run', async () => {
    const pipeline = new Pipeline({ config: null });
    pipeline.through([new MarkerStage()]);
    await pipeline.process({ files: [] });

    // `_initializeStages()` returns early once instances exist, so a stage
    // added afterwards was pushed onto `this.stages`, never instantiated, and
    // never run — silently. Being told is strictly better than discovering it
    // from output that is missing a stage's effect.
    expect(() => pipeline.through([new MarkerStage()])).toThrow(/already run/);
  });
});
