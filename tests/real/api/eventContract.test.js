/**
 * The pipeline event contract, checked against what the pipeline actually emits.
 *
 * A `.d.ts` that compiles proves nothing about the runtime; it type-checks
 * against itself. These declarations had drifted badly enough that a consumer
 * following them could not work: `stage:start` was declared to carry `input`
 * and carries `inputCount`, `pipeline:complete` was declared to carry `result`
 * and carries `resultCount`, `stage:recover` promised `recoveredResult`. Each
 * of those was a *deliberate* runtime change — lifecycle events stopped
 * carrying file payloads because an `onEvent` listener was seeing content that
 * had not yet reached the secrets guard — so the declarations were advertising
 * access to exactly the data the implementation had removed for safety.
 *
 * So this runs a real pipeline, collects every event, and compares the keys
 * against the interfaces in `types/index.d.ts`. Drift in either direction fails.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Pipeline from '../../../src/pipeline/Pipeline.js';
import Stage from '../../../src/pipeline/Stage.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const declaration = readFileSync(path.join(repoRoot, 'types/index.d.ts'), 'utf8');

/**
 * Which interface describes which event, read out of `PipelineEventMap`.
 *
 * Parsed rather than restated. A hard-coded copy of the map is a second
 * declaration to keep in step, and it would pass while the real map pointed an
 * event at the wrong payload — which is the drift this file exists to catch.
 */
const EVENT_INTERFACES = Object.fromEntries(
  [
    ...(
      declaration.match(/export interface PipelineEventMap \{([\s\S]*?)\n\}/)?.[1] ?? ''
    ).matchAll(/'([\w:]+)':\s*(\w+);/g),
  ].map((match) => [match[1], match[2]]),
);

/** Every event the runtime can emit, so the map cannot quietly omit one. */
const RUNTIME_EVENTS = [
  'pipeline:start',
  'pipeline:complete',
  'pipeline:error',
  'stage:start',
  'stage:complete',
  'stage:error',
  'stage:recover',
  'stage:progress',
  'file:batch',
  'stage:log',
];

/**
 * The property names an interface declares, and which of them are optional.
 *
 * Deliberately a text scan rather than a TypeScript parse: the point is to fail
 * when the declaration text and the runtime disagree, and pulling in a compiler
 * to read four lines of interface body would make this test heavier than the
 * thing it guards.
 *
 * @param {string} name - Interface name
 * @returns {{all: Set<string>, required: Set<string>}} Declared property names
 */
function declaredProperties(name) {
  const body = declaration.match(new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1];
  if (body === undefined) throw new Error(`No interface ${name} in types/index.d.ts`);

  const all = new Set();
  const required = new Set();

  // Property lines only: `name: T;` or `name?: T;` at one level of indentation.
  // JSDoc bodies and nested object types are skipped by the indentation anchor.
  for (const match of body.matchAll(/^ {2}(\w+)(\??):/gm)) {
    all.add(match[1]);
    if (match[2] === '') required.add(match[1]);
  }

  return { all, required };
}

/** A stage that emits one of everything the contract covers. */
class ChattyStage extends Stage {
  constructor() {
    super({ name: 'ChattyStage' });
  }

  async process(input) {
    this.log('working', 'info');
    this.emitProgress(50, 'halfway', { completed: 1, total: 2, item: 'a.js' });
    // The file-event throttle emits on every 20th file or every 100ms.
    for (let i = 0; i < 25; i++) this.emitFileEvent(`file-${i}.js`, 'processed');
    return { ...input, files: [...input.files, { path: 'b.js' }] };
  }
}

/** A stage that fails and recovers, for `stage:error` and `stage:recover`. */
class RecoveringStage extends Stage {
  constructor() {
    super({ name: 'RecoveringStage' });
  }

  async process() {
    throw new Error('deliberate');
  }

  async handleError(error, input) {
    return { ...input, recovered: true };
  }
}

/** A stage that fails fatally, for `pipeline:error`. */
class FatalStage extends Stage {
  constructor() {
    super({ name: 'FatalStage' });
    this.fatal = true;
  }

  async process() {
    throw new Error('fatal');
  }
}

/**
 * Run a pipeline and collect every event it emits.
 * @param {Stage[]} stages - Stages to run
 * @returns {Promise<Map<string, Object[]>>} Payloads by event name
 */
async function collect(stages) {
  const pipeline = new Pipeline({ continueOnError: true, emitProgress: true });
  const seen = new Map();

  for (const event of Object.keys(EVENT_INTERFACES)) {
    pipeline.on(event, (data) => {
      if (!seen.has(event)) seen.set(event, []);
      seen.get(event).push(data);
    });
  }

  pipeline.through(stages);

  try {
    await pipeline.process({ basePath: repoRoot, files: [{ path: 'a.js' }] });
  } catch {
    // A fatal stage is one of the cases under test.
  }

  return seen;
}

describe('pipeline event contract', () => {
  let emitted;

  beforeAll(async () => {
    emitted = new Map();

    for (const [event, payloads] of await collect([new ChattyStage(), new RecoveringStage()])) {
      emitted.set(event, payloads);
    }

    for (const [event, payloads] of await collect([new FatalStage()])) {
      if (!emitted.has(event)) emitted.set(event, payloads);
    }
  });

  it('emits every event the map declares', () => {
    const missing = RUNTIME_EVENTS.filter((event) => !emitted.has(event));

    // A declared event nothing can produce is a promise to a consumer that
    // their handler will one day run.
    expect(missing).toEqual([]);
  });

  it.each(Object.entries(EVENT_INTERFACES))(
    '%s carries exactly what %s declares',
    (event, interfaceName) => {
      const { all, required } = declaredProperties(interfaceName);
      const payloads = emitted.get(event) ?? [];

      expect(payloads.length).toBeGreaterThan(0);

      // Optional keys are checked against the union: `stage:progress` carries
      // `completed`/`total` only when the stage knows its denominator, and both
      // shapes are valid.
      const anyKey = new Set(payloads.flatMap((payload) => Object.keys(payload)));
      const undeclared = [...anyKey].filter((key) => !all.has(key)).sort();

      // Required keys are checked against every payload. Taking the union here
      // meant one emission carrying `duration` excused every other emission
      // that did not — which is exactly the case a required field exists to
      // rule out.
      const sometimesMissing = [...required]
        .filter((key) => payloads.some((payload) => !(key in payload)))
        .sort();

      expect({ event, undeclared, sometimesMissing }).toEqual({
        event,
        undeclared: [],
        sometimesMissing: [],
      });
    },
  );

  it('never carries a file payload on a lifecycle event', () => {
    // The reason the declarations were wrong in the first place. `stage:debug`
    // is where raw values live, it is documented as unstable, and the SDK does
    // not forward it.
    for (const [event, payloads] of emitted) {
      for (const payload of payloads) {
        expect({ event, hasFiles: 'files' in payload }).toEqual({ event, hasFiles: false });
        expect({ event, hasInput: 'input' in payload }).toEqual({ event, hasInput: false });
        expect({ event, hasOutput: 'output' in payload }).toEqual({ event, hasOutput: false });
      }
    }
  });

  it('maps exactly the events the runtime can emit', () => {
    expect(Object.keys(EVENT_INTERFACES).sort()).toEqual([...RUNTIME_EVENTS].sort());
  });

  it('names an interface that exists for every mapped event', () => {
    for (const [event, interfaceName] of Object.entries(EVENT_INTERFACES)) {
      expect({
        event,
        exists: declaration.includes(`export interface ${interfaceName} {`),
      }).toEqual({ event, exists: true });
    }
  });

  it('forwards every mapped event through the SDK, not just the raw pipeline', async () => {
    // The pipeline-level events were declared in the map and dropped by
    // `scan()`'s forwarding list, so a consumer could type a handler for
    // `pipeline:complete`, compile, and never see it fire.
    const { scan } = await import('../../../src/index.js');
    const { ConfigManager } = await import('../../../src/config/ConfigManager.js');

    const config = await ConfigManager.create({ userConfig: false });
    const forwarded = new Set();

    // eslint-disable-next-line no-unused-vars
    for await (const _file of scan(repoRoot, {
      config,
      scope: ['package.json'],
      onEvent: (event) => forwarded.add(event.type),
    })) {
      // Draining is the point.
    }

    for (const event of ['pipeline:start', 'pipeline:complete', 'stage:start', 'stage:complete']) {
      expect({ event, forwarded: forwarded.has(event) }).toEqual({ event, forwarded: true });
    }
  });
});
