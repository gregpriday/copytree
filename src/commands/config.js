/**
 * `copytree config show|validate` — plain, deterministic, pipe-safe.
 *
 * These used to render a React terminal application to print a table. A table
 * does not need a reconciler, and routing it through one cost startup time,
 * made redirected output unreliable, and produced JSON that was really a
 * rendered string. They are ordinary command handlers now.
 *
 * Validation inspects only the sources that actually exist. It no longer checks
 * environment variables, which CopyTree stopped supporting, or directories the
 * loader never reads.
 */

import { ConfigManager, defaultDataConfigPath } from '../config/ConfigManager.js';
import path from 'path';
import fs from '../utils/fsx.js';
import { Feedback, writePayload } from '../cli/io.js';
import { json, table } from '../cli/render/format.js';
import { PolicyError, ValidationError, ERROR_CODES } from '../utils/errors.js';
import { VERSION } from '../version.js';
import { fileURLToPath } from 'url';

/** Schema identifier for `config show --format json`. */
export const CONFIG_SCHEMA = 'copytree-config@1';

/** Schema identifier for `config validate --format json`. */
export const CONFIG_VALIDATION_SCHEMA = 'copytree-config-validation@1';

/**
 * Run a `config` subcommand.
 * @param {Object} request - Canonical request
 * @param {Object} [context={}] - Execution context
 * @returns {Promise<Object>} The command's model
 */
export default async function configCommand(request, context = {}) {
  if (request.operation === 'config-validate') return configValidate(request, context);
  if (request.operation === 'config-migrate') return configMigrate(request, context);
  return configShow(request, context);
}

/**
 * `copytree config show`.
 * @param {Object} request - Canonical request
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Config model
 */
async function configShow(request, context) {
  const feedback = new Feedback({ feedback: request.feedback });
  feedback.notices(context.notices);

  const report = request.report;

  // Revealing secrets to a pipe is how a credential ends up in a log file or a
  // pasted transcript. Allowed only interactively, or with an explicit --force.
  if (report.showSecrets && !process.stdout.isTTY && !report.force) {
    throw new ValidationError(
      '--show-secrets refuses to write secrets to a redirected stream',
      'show-secrets',
      true,
      {
        code: ERROR_CODES.INVALID_OPTION,
        suggestion: 'Run it in a terminal, or add --force if you really mean it',
      },
    );
  }

  const config = await ConfigManager.create();
  const effective = config.effective({
    redact: !report.showSecrets,
    section: report.section ?? null,
  });

  const model = {
    schema: CONFIG_SCHEMA,
    copytreeVersion: VERSION,
    section: report.section ?? null,
    sources: {
      packagedDefaults: config.configPath,
      dataConfig: config.dataConfigPath,
      legacyUserConfig: config.userConfigPath,
      dataConfigPresent: await fs.pathExists(config.dataConfigPath),
      legacyUserConfigPresent: await fs.pathExists(config.userConfigPath),
    },
    loadErrors: config.getLoadErrors(),
    values: Object.entries(effective)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => ({
        key,
        value: entry.value,
        type: entry.type,
        source: entry.source,
        sensitive: entry.redacted,
      })),
  };

  feedback.detail(`Packaged defaults: ${config.configPath}`);
  feedback.detail(`Data configuration: ${config.dataConfigPath}`);
  feedback.detail(`${model.values.length} effective values`);

  const text =
    report.format === 'json'
      ? json(model)
      : renderConfigText(model, { sources: report.sources === true });

  const delivered = await writePayload(text, { output: report.output });
  if (delivered.destination === 'file')
    feedback.write(`Configuration written to ${delivered.path}`);

  return model;
}

/**
 * Render the effective configuration as text.
 * @param {Object} model - Config model
 * @param {Object} [options={}] - Rendering options
 * @returns {string} Report text
 */
function renderConfigText(model, options = {}) {
  const columns = [
    { key: 'key', label: 'Key' },
    { key: 'value', label: 'Value' },
  ];
  if (options.sources) columns.push({ key: 'source', label: 'Source' });

  const lines = [
    `CopyTree ${model.copytreeVersion} — effective configuration`,
    `Packaged defaults: ${model.sources.packagedDefaults}`,
    `Data configuration: ${model.sources.dataConfig}${model.sources.dataConfigPresent ? '' : ' (absent)'}`,
    `Legacy user configuration: ${model.sources.legacyUserConfig}${model.sources.legacyUserConfigPresent ? '' : ' (absent)'}`,
    '',
    ...table(
      columns,
      model.values.map((entry) => ({
        key: entry.key,
        value: formatValue(entry.value),
        source: entry.source,
      })),
    ),
  ];

  if (model.loadErrors.length > 0) {
    lines.push('', 'Load errors:');
    for (const error of model.loadErrors) lines.push(`  ${error.scope}: ${error.message}`);
  }

  return `${lines.join('\n')}\n`;
}

/**
 * Present a configuration value compactly.
 * @param {*} value - Value
 * @returns {string} Rendered value
 */
function formatValue(value) {
  if (Array.isArray(value)) return `[${value.length} entries]`;
  if (value === null || value === undefined) return '(unset)';
  return String(value);
}

/**
 * `copytree config validate`.
 * @param {Object} request - Canonical request
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Validation model
 */
async function configValidate(request, context) {
  const feedback = new Feedback({ feedback: request.feedback });
  feedback.notices(context.notices);

  const checks = [];
  const record = (name, status, detail, remediation = null) =>
    checks.push({ name, status, detail, ...(remediation ? { remediation } : {}) });

  let config = null;
  let schemaInfo = null;
  try {
    config = new ConfigManager({ noValidate: true });
    await config.loadConfiguration();
    record(
      'packaged defaults',
      config.isDefaultsLoaded ? 'pass' : 'fail',
      config.isDefaultsLoaded
        ? `loaded from ${config.configPath}`
        : `no defaults found in ${config.configPath}`,
      config.isDefaultsLoaded
        ? null
        : 'Reinstall CopyTree; the packaged config directory is missing',
    );
  } catch (error) {
    // A schema-version refusal is not a broken installation. It is a *user*
    // file written for a later CopyTree, and it surfaces here because the
    // compatibility check runs before anything else can. Reporting it against
    // "packaged defaults" with "Reinstall CopyTree" sends someone to reinstall
    // a package that is working perfectly.
    const isVersion = error.details?.configKey === 'schemaVersion';

    record(
      isVersion ? 'schema version' : 'packaged defaults',
      'fail',
      error.message,
      isVersion
        ? (error.details?.suggestion ?? 'Upgrade CopyTree')
        : 'Reinstall CopyTree; the packaged config directory is missing',
    );
  }

  if (config) {
    for (const [label, dir] of [
      ['data configuration', config.dataConfigPath],
      ['legacy user configuration', config.userConfigPath],
    ]) {
      const present = await fs.pathExists(dir);
      record(label, 'pass', present ? `present at ${dir}` : `absent (${dir})`);
    }

    const legacyJs = await legacyExecutableConfigs(config.userConfigPath);
    if (legacyJs.length > 0) {
      record(
        'executable configuration',
        'warn',
        `${legacyJs.length} JavaScript config file${legacyJs.length === 1 ? '' : 's'} in ${config.userConfigPath}`,
        `Move these settings into ${defaultDataConfigPath()}/config.yaml`,
      );
    }

    for (const error of config.getLoadErrors()) {
      record(`load: ${error.scope}`, 'fail', error.message, 'Fix or remove the offending file');
    }

    try {
      config.setValidationEnabled(true);
      await config.loadSchema();
      schemaInfo = config.getSchemaInfo();
      config.validateConfig();
      record(
        'schema',
        'pass',
        schemaInfo.loaded ? `validated against schema ${schemaInfo.version}` : 'schema not loaded',
      );
    } catch (error) {
      record('schema', 'fail', error.message, 'Correct the reported configuration keys');
    }
  }

  const failures = checks.filter((check) => check.status === 'fail');
  const warnings = checks.filter((check) => check.status === 'warn');

  const model = {
    schema: CONFIG_VALIDATION_SCHEMA,
    copytreeVersion: VERSION,
    valid: failures.length === 0,
    checks,
    failures: failures.length,
    warnings: warnings.length,
    schemaInfo,
  };

  feedback.detail(`Ran ${checks.length} checks`);

  const text = request.report.format === 'json' ? json(model) : renderValidationText(model);
  await writePayload(text, { output: request.report.output });

  if (!model.valid) {
    throw new PolicyError('Configuration is invalid', 'config validate', {
      suggestion: 'Fix the failing checks above',
    });
  }
  if (request.policy.strict && warnings.length > 0) {
    throw new PolicyError(
      `${warnings.length} configuration warning${warnings.length === 1 ? '' : 's'} under --strict`,
      '--strict',
      { suggestion: 'Address the warnings, or drop --strict' },
    );
  }

  return model;
}

/**
 * Render validation results as text.
 * @param {Object} model - Validation model
 * @returns {string} Report text
 */
function renderValidationText(model) {
  const mark = { pass: '[ok]', warn: '[warn]', fail: '[fail]' };
  const lines = model.checks.map((check) => {
    const remediation = check.remediation ? `\n         ${check.remediation}` : '';
    return `${mark[check.status]} ${check.name}: ${check.detail}${remediation}`;
  });
  lines.push('');
  lines.push(
    model.valid
      ? `Configuration is valid${model.warnings > 0 ? ` (${model.warnings} warnings)` : ''}`
      : `Configuration is invalid (${model.failures} failures)`,
  );
  return `${lines.join('\n')}\n`;
}

/** Schema identifier for `config migrate --format json`. */
export const CONFIG_MIGRATION_SCHEMA = 'copytree-config-migration@1';

/**
 * `copytree config migrate`.
 *
 * Converts the legacy `~/.copytree/*.{js,json}` configuration into a data file
 * in the platform configuration directory. Executable configuration in a home
 * directory is arbitrary code running inside the host process, which is
 * inappropriate for an embedder and unreproducible for everyone; this is the
 * one-command way off it.
 *
 * Prints by default. The legacy directory is never modified, so a migration
 * that turns out wrong is undone by deleting one file.
 *
 * @param {Object} request - Canonical request
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Migration model
 */
async function configMigrate(request, context) {
  const feedback = new Feedback({ feedback: request.feedback });
  feedback.notices(context.notices);

  const config = new ConfigManager({
    noValidate: true,
    ...(process.env.COPYTREE_LEGACY_CONFIG_PATH
      ? { userConfigPath: process.env.COPYTREE_LEGACY_CONFIG_PATH }
      : {}),
  });
  await config.loadConfiguration();

  const legacyDir = config.userConfigPath;
  const targetDir = process.env.COPYTREE_DATA_CONFIG_PATH || defaultDataConfigPath();
  const target = path.join(targetDir, 'config.yaml');

  const sources = (await fs.readdir(legacyDir).catch(() => [])).filter((file) =>
    /\.(js|json)$/.test(file),
  );

  // A source that failed to load contributes nothing to the YAML. Listing it
  // as a source and then advising "remove the legacy directory" would lose the
  // settings it contained, silently and permanently.
  const failures = config
    .getLoadErrors()
    .filter((entry) => String(entry.scope).startsWith('user:'));

  const model = {
    schema: CONFIG_MIGRATION_SCHEMA,
    from: legacyDir,
    to: target,
    sources,
    failedSources: failures.map((entry) => ({
      source: String(entry.scope).replace(/^user:/, ''),
      message: entry.message,
    })),
    sections: Object.keys(config.userConfig).sort(),
    written: false,
  };

  if (sources.length === 0) {
    const text =
      request.report.format === 'json'
        ? json(model)
        : `No legacy configuration found in ${legacyDir}. Nothing to migrate.\n`;
    await writePayload(text, { output: request.report.output });
    return model;
  }

  if (failures.length > 0) {
    throw new ValidationError(
      `${failures.length} legacy configuration file${failures.length === 1 ? '' : 's'} could not be read`,
      'config-migrate',
      failures.map((entry) => entry.scope),
      {
        code: ERROR_CODES.CONFIG_INVALID,
        suggestion: `Fix or remove ${failures
          .map((entry) => String(entry.scope).replace(/^user:/, ''))
          .join(', ')} in ${legacyDir}, then run the migration again`,
      },
    );
  }

  // Serialized from the loaded user configuration rather than from the files,
  // so an executable config is captured as the values it actually produced.
  //
  // Pruned first. The schema is closed, and several keys it used to accept do
  // nothing and were removed for 1.0 — so copying a legacy file across verbatim
  // produced a `config.yaml` that the very next run rejected, from a command
  // whose entire job is to leave the user with a working configuration.
  // Dropping them is right, and saying which were dropped is what makes it
  // honest.
  const { kept, dropped } = pruneToSchema(config.userConfig, await loadSchemaProperties());
  model.droppedKeys = dropped;

  /**
   * Run a set of sections through the schema, in the migration's voice.
   *
   * The bare configuration error says "CopyTree configuration is invalid" and
   * advises running `config validate`, which is advice about a file this
   * command has not written yet — so the reader goes looking for a problem in
   * a configuration that is, as far as they can tell, fine.
   *
   * @param {Object} sections - Configuration sections to check
   * @returns {Promise<void>} Resolves when valid
   * @throws {ValidationError} When the schema rejects a value
   */
  async function assertAcceptable(sections) {
    const check = new ConfigManager({ userConfig: false, dataConfigPath: null });
    await check.loadConfiguration();
    for (const [section, value] of Object.entries(sections)) {
      check.set(section, value);
    }
    await check.loadSchema();

    try {
      check.validateConfig();
    } catch (error) {
      throw new ValidationError(
        `${legacyDir} contains a value CopyTree cannot accept: ${error.message.replace(/^Configuration validation failed: /, '')}`,
        'config-migrate',
        legacyDir,
        {
          code: ERROR_CODES.CONFIG_INVALID,
          suggestion: `Correct it in ${legacyDir}, then run the migration again`,
        },
      );
    }
  }

  // Validated before it is offered, let alone written. Pruning removes keys the
  // schema does not know; it cannot fix a value of the wrong type or outside
  // its range, and a migration whose output the next run rejects has not
  // migrated anything.
  await assertAcceptable(kept);

  const { dumpYaml, loadYaml } = await import('../utils/yaml.js');
  const document = await dumpYaml(kept, { noRefs: true, sortKeys: true });

  // Read back exactly what is about to be written, and check that too.
  //
  // The validation above ran on values held in memory, and a value can be
  // acceptable in memory and unwritable: a legacy `.js` configuration is
  // executed, so it can export anything JavaScript can express. A `Set`
  // satisfies AJV's idea of an object — no own enumerable properties, so
  // nothing to reject — survives pruning, and then serialises as `!!set`, a
  // tag the loader does not accept. The result was a `config.yaml` this
  // command wrote and the next run could not parse.
  //
  // Reloading is the only check that covers the whole class, because it asks
  // the question the user's next run will ask.
  let reloaded;
  try {
    reloaded = await loadYaml(document);
  } catch (error) {
    throw new ValidationError(
      `${legacyDir} contains a value CopyTree cannot write as YAML: ${error.message}`,
      'config-migrate',
      legacyDir,
      {
        code: ERROR_CODES.CONFIG_INVALID,
        suggestion:
          `Replace it in ${legacyDir} with plain data — a string, number, boolean, ` +
          `array or object — then run the migration again`,
      },
    );
  }

  await assertAcceptable(reloaded ?? {});

  model.yaml = document;

  if (dropped.length > 0) {
    feedback.write(
      `Left out ${dropped.length} setting${dropped.length === 1 ? '' : 's'} CopyTree no longer ` +
        `recognises: ${dropped.join(', ')}`,
    );
  }

  if (!request.report.write) {
    const text = request.report.format === 'json' ? json(model) : document;
    await writePayload(text, { output: request.report.output });
    feedback.write(`Nothing written. Add --write to create ${target}`);
    return model;
  }

  if ((await fs.pathExists(target)) && !request.report.force) {
    throw new ValidationError(`${target} already exists`, 'config-migrate', target, {
      code: ERROR_CODES.INVALID_OPTION,
      suggestion: 'Add --force to replace it, or merge the settings by hand',
    });
  }

  await fs.ensureDir(targetDir);
  await fs.writeFile(target, document, 'utf8');
  model.written = true;

  feedback.write(`Wrote ${target}`);
  feedback.write(`${legacyDir} was left untouched; remove it once you are satisfied.`);

  const text = request.report.format === 'json' ? json(model) : `Wrote ${target}\n`;
  await writePayload(text, { output: request.report.output });
  return model;
}

/**
 * List executable configuration files in the legacy directory.
 * @param {string} dir - Legacy configuration directory
 * @returns {Promise<string[]>} Filenames
 */
async function legacyExecutableConfigs(dir) {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((entry) => entry.endsWith('.js'));
  } catch {
    return [];
  }
}

/**
 * The schema's `properties` tree, for pruning a legacy configuration.
 *
 * Read from the packaged schema rather than restated, so the migration cannot
 * drift from what validation will accept.
 *
 * @returns {Promise<Object>} The schema root
 */
async function loadSchemaProperties() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath = path.resolve(here, '../../config/schema.json');
  return JSON.parse(await fs.readFile(schemaPath, 'utf8'));
}

/**
 * Split a configuration into what the schema accepts and what it does not.
 *
 * @param {Object} value - Configuration to prune
 * @param {Object} schemaNode - Schema node describing `value`
 * @param {string} [prefix=''] - Dotted path of `value`
 * @returns {{kept: Object, dropped: string[]}} Accepted subtree, and the dotted paths removed
 */
function pruneToSchema(value, schemaNode, prefix = '') {
  // Null prototype. The output is built from keys read out of a user's file,
  // and assigning `__proto__` into an ordinary object literal mutates the
  // prototype chain instead of setting a property.
  const kept = Object.create(null);
  const dropped = [];
  const properties = schemaNode?.properties ?? {};

  for (const [key, child] of Object.entries(value ?? {})) {
    const dotted = prefix ? `${prefix}.${key}` : key;

    // `Object.hasOwn`, not a property read. `properties['constructor']` finds
    // `Object.prototype.constructor` and would wave through a key named after
    // anything on the prototype chain.
    if (!Object.hasOwn(properties, key)) {
      dropped.push(dotted);
      continue;
    }

    const childSchema = properties[key];

    // Recurse only where the schema describes an object with its own
    // properties. A declared object without `properties`, or any scalar or
    // array, is a leaf the schema accepts whole.
    if (
      childSchema.properties &&
      child !== null &&
      typeof child === 'object' &&
      !Array.isArray(child)
    ) {
      const nested = pruneToSchema(child, childSchema, dotted);
      dropped.push(...nested.dropped);
      // An object emptied by pruning is not carried over: writing
      // `app: {}` is noise in a file someone has to read.
      if (Object.keys(nested.kept).length > 0) kept[key] = nested.kept;
      continue;
    }

    kept[key] = child;
  }

  // Back to an ordinary object for serialization: the null prototype was for
  // building it safely, and a YAML dumper should not have to reason about it.
  return { kept: { ...kept }, dropped };
}
