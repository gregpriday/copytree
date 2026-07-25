import { format } from '../../../../src/api/format.js';
import { formatStream } from '../../../../src/api/formatStream.js';
import OutputFormattingStage from '../../../../src/pipeline/stages/OutputFormattingStage.js';
import { OUTPUT_FORMAT_VERSIONS } from '../../../../src/utils/outputVersion.js';

const FILES = [
  {
    path: 'src/a.js',
    absolutePath: '/repo/src/a.js',
    size: 10,
    content: 'const a = 1;',
    isBinary: false,
  },
];

/**
 * Drain an async generator into a single string.
 * @param {AsyncIterable<string>} generator - Chunk source
 * @returns {Promise<string>} Joined output
 */
async function drain(generator) {
  let out = '';
  for await (const chunk of generator) out += chunk;
  return out;
}

/**
 * Run the CLI's buffered formatting stage.
 * @param {string} outputFormat - Format name
 * @returns {Promise<string>} Formatted output
 */
async function viaStage(outputFormat) {
  const stage = new OutputFormattingStage({
    format: outputFormat,
    config: { get: (_key, fallback) => fallback },
  });
  const result = await stage.process({ basePath: '/repo', files: FILES, options: {} });
  return result.output;
}

describe('output format version parity', () => {
  // The version string is a compatibility surface: a consumer reads it to
  // detect that the document shape changed. A surface that omits it reports
  // `undefined`, which reads as "nothing changed" rather than "unknown".
  //
  // The CLI's JSON and NDJSON both omitted it while the SDK's equivalents
  // carried it, so the same format was two different documents depending on
  // which entry point produced it.

  test('the SDK and the CLI stage agree on the JSON version', async () => {
    const sdk = JSON.parse(await format(FILES, { format: 'json', basePath: '/repo' }));
    const cli = JSON.parse(await viaStage('json'));

    expect(sdk.metadata.format).toBe(OUTPUT_FORMAT_VERSIONS.json);
    expect(cli.metadata.format).toBe(sdk.metadata.format);
  });

  test('the streaming JSON surface agrees too', async () => {
    const streamed = JSON.parse(
      await drain(formatStream(FILES, { format: 'json', basePath: '/repo' })),
    );

    expect(streamed.metadata.format).toBe(OUTPUT_FORMAT_VERSIONS.json);
  });

  test('every NDJSON surface stamps the version on its metadata record', async () => {
    const firstRecord = (text) => JSON.parse(text.trim().split('\n')[0]);

    const cli = firstRecord(await viaStage('ndjson'));
    const streamed = firstRecord(
      await drain(formatStream(FILES, { format: 'ndjson', basePath: '/repo' })),
    );

    expect(cli.format).toBe(OUTPUT_FORMAT_VERSIONS.ndjson);
    expect(streamed.format).toBe(OUTPUT_FORMAT_VERSIONS.ndjson);
  });

  test('every XML surface stamps the version', async () => {
    const sdk = await format(FILES, { format: 'xml', basePath: '/repo' });
    const cli = await viaStage('xml');
    const streamed = await drain(formatStream(FILES, { format: 'xml', basePath: '/repo' }));

    const tag = `<ct:format>${OUTPUT_FORMAT_VERSIONS.xml}</ct:format>`;
    expect(sdk).toContain(tag);
    expect(cli).toContain(tag);
    expect(streamed).toContain(tag);
  });

  test('every Markdown surface stamps the version in front matter', async () => {
    const sdk = await format(FILES, { format: 'markdown', basePath: '/repo' });
    const cli = await viaStage('markdown');
    const streamed = await drain(formatStream(FILES, { format: 'markdown', basePath: '/repo' }));

    const line = `format: ${OUTPUT_FORMAT_VERSIONS.markdown}`;
    expect(sdk).toContain(line);
    expect(cli).toContain(line);
    expect(streamed).toContain(line);
  });
});
