import Stage from '../Stage.js';
import GitleaksAdapter from '../../services/GitleaksAdapter.js';
import SecretRedactor from '../../utils/SecretRedactor.js';
import { SecretsDetectedError, isAbortError } from '../../utils/errors.js';
import { EXCLUSION_REASONS } from '../../utils/exclusionReport.js';
import { scanContent } from '../../utils/secretPatterns.js';
import { Minimatch } from 'minimatch';

/**
 * How many paths to name in the stats block.
 *
 * Enough to answer "which one?" on a normal run, few enough that a repository
 * full of key material cannot turn a status line into a wall of text. The
 * counts alongside these lists are always exact.
 */
const MAX_REPORTED_PATHS = 5;

const SECRET_FILE_PATTERNS = [
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  '*.p8',
  '*.asc',
  'id_rsa',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
  'credentials.*',
  'secrets.*',
  '*.jks',
  '*.keystore',
  '.npmrc',
  '.aws/credentials',
  '.docker/config.json',
  '*.tfstate',
];

class SecretsGuardStage extends Stage {
  constructor(options = {}) {
    super(options);
    // Skipping this stage emits unredacted credentials with a success exit code.
    this.fatal = true;
    // Built in `_resolveSettings()`, not here: the adapter's binary path,
    // config path and extra arguments are public, schema-declared
    // configuration, and the base class's config proxy returns only defaults
    // until `onInit()` supplies the real instance.
    this.gitleaks = null;
    this.useGitleaks = false;
    // Which scanner to use is decided on the first file that has bytes to scan,
    // not at construction — see `_resolveScanner()`.
    this._scannerResolved = false;
    this._gitleaksFailureReported = false;
    // Whether the built-in scanner has actually been used, as opposed to merely
    // being the scanner that would be used next. `_scannerName()` reports it.
    this._builtinScanned = false;
    // Set when the preferred scanner failed mid-run and the built-in scanner
    // took over. A degraded scan is still a scan, but the caller has to be able
    // to tell the difference — silently downgrading the guard and reporting a
    // clean run is how a secret reaches a model.
    this._degradation = null;
    this._resolveSettings();
  }

  /**
   * Read every configurable value in one place.
   *
   * Called from the constructor and again from `onInit()`, because a stage
   * constructed without an explicit `config` reads defaults through the base
   * class's null-object proxy. The pipeline injects the real configuration
   * during `onInit`, and until these are re-read the stage is running on
   * defaults that may not be what the caller asked for.
   *
   * @private
   */
  _resolveSettings() {
    const options = this.options || {};

    this.enabled = options.enabled ?? this.config.get('secretsGuard.enabled', true);
    this.excludeGlobs =
      options.excludeGlobs || this.config.get('secretsGuard.exclude', SECRET_FILE_PATTERNS);
    this.redactInline = options.redactInline ?? this.config.get('secretsGuard.redactInline', true);
    this.redactionMode =
      options.redactionMode || this.config.get('secretsGuard.redactionMode', 'typed');
    // `??`, not `||`. The schema allows a minimum of 0, and `maxFileBytes: 0`
    // — "scan nothing; treat every file as unscannable" — silently became the
    // 5MB default, which is the opposite policy.
    this.maxFileBytes =
      options.maxFileBytes ?? this.config.get('secretsGuard.maxFileBytes', 5_000_000);
    this.failOnSecrets =
      options.failOnSecrets ?? this.config.get('secretsGuard.failOnSecrets', false);

    // What to do with a file too large to scan. Including it unscanned is the
    // one option that looks like protection and is not, so it is not the
    // default and has to be asked for by name.
    this.oversizePolicy =
      options.oversizePolicy || this.config.get('secretsGuard.oversizePolicy', 'exclude');

    // The external scanner's public configuration, from the operation's own
    // ConfigManager. `secretsGuard.gitleaks.binaryPath`, `configPath`,
    // `extraArgs` and `logLevel` are all declared in the schema, and none of
    // them reached the adapter: a user pointing CopyTree at a custom Gitleaks
    // build or ruleset had it accepted, validated, and ignored.
    this.gitleaks = new GitleaksAdapter({
      ...this.config.get('secretsGuard.gitleaks', {}),
      ...(options.gitleaks || {}),
    });
    this._scannerResolved = false;

    // Dry runs carry no content, so nothing can be *scanned*. The exclusions
    // this stage applies are not all content-based, though: the secret-prone
    // glob list and the size ceiling are both decidable from the manifest, and
    // omitting the stage entirely made a dry run select files the real run
    // would drop. A preview that overstates the selection is a preview a UI
    // cannot build on.
    this.planOnly = options.planOnly === true;
  }

  async onInit(context) {
    await super.onInit(context);
    this._resolveSettings();
  }

  /**
   * Decide which scanner to use, on first need.
   *
   * This used to happen in `onInit()`, which runs before the stage knows
   * whether there is anything to scan — so `copytree --only-tree`, a dry run, an
   * empty directory, and a selection whose every file was excluded as
   * secret-prone all spawned `gitleaks version` to answer a question they never
   * asked. Resolving it here means the external process is started only by a run
   * that has bytes to hand it.
   *
   * @returns {Promise<void>}
   * @private
   */
  async _resolveScanner() {
    if (this._scannerResolved) return;
    this._scannerResolved = true;

    this.useGitleaks = await this.gitleaks.isAvailable();
    if (this.useGitleaks) {
      const version = await this.gitleaks.getVersion();
      this.log(`Secrets Guard: using Gitleaks ${version || 'unknown'}`, 'info');
    } else {
      this.log('Secrets Guard: using basic regex scanning (Gitleaks not found)', 'info');
    }
  }

  async process(input) {
    if (!this.enabled) {
      return input;
    }

    const files = input.files || [];
    const report = input.exclusionReport;
    const processedFiles = [];
    const findings = [];
    let redactionCount = 0;
    let excludedCount = 0;
    let unscannableCount = 0;
    let excludedWithSecrets = 0;
    let redactionFailures = 0;
    // Which files, not just how many. "1 secret-prone file left out" tells the
    // reader something happened but not whether it mattered; naming `.env` ends
    // the question. Capped so a repository full of key material cannot turn one
    // status line into a wall of text — the count still reports the total.
    const excludedPaths = [];
    const unscannablePaths = [];
    const redactedPaths = [];
    const excludedWithSecretsPaths = [];
    const remember = (list, filePath) => {
      if (list.length < MAX_REPORTED_PATHS) list.push(filePath);
    };

    for (const file of files) {
      if (!file) {
        processedFiles.push(file);
        continue;
      }

      const filePath = file.relativePath || file.path || '';

      if (this._isExcluded(filePath)) {
        this.log(`Excluding secret-prone file: ${filePath}`, 'debug');
        report?.add({
          path: filePath,
          size: file.size || 0,
          reason: EXCLUSION_REASONS.SECRET_FILE,
          rule: 'secretsGuard.exclude',
        });
        excludedCount++;
        remember(excludedPaths, filePath);
        continue;
      }

      // Content that is not a string cannot be scanned or redacted: the scanner
      // would coerce a Buffer to a string to match against, and the redactor
      // would then call `.split()` on the Buffer and throw. This stage is fatal,
      // so that TypeError took the whole run down. A document transformer that
      // leaves its content as a Buffer is the way it happens.
      const hasStringContent = typeof file.content === 'string';

      if (file.content != null && !hasStringContent) {
        this.log(`Excluding unscannable file: ${filePath} (content is not text)`, 'warn');
        report?.add({
          path: filePath,
          size: file.size || 0,
          reason: EXCLUSION_REASONS.SECRET_UNSCANNABLE,
          rule: 'secretsGuard.nonTextContent',
        });
        unscannableCount++;
        remember(unscannablePaths, filePath);
        continue;
      }

      // Size is the one scan-limit input a dry run does have. Using it keeps
      // the unscannable exclusions in the preview; the real run measures the
      // loaded (and possibly transformed) content, so the two can disagree for
      // a file sitting within a rounding error of the limit.
      const scanBytes = hasStringContent
        ? Buffer.byteLength(file.content, 'utf8')
        : this.planOnly
          ? file.size || 0
          : null;

      if (scanBytes === null) {
        processedFiles.push(file);
        continue;
      }

      if (scanBytes > this.maxFileBytes) {
        // Emitting a file the scanner could not read, while reporting that
        // secrets protection is on, is the least safe reading of "too large".
        if (this.oversizePolicy === 'scan') {
          this.log(`Scanning oversize file ${filePath} (oversizePolicy: scan)`, 'debug');
        } else if (this.oversizePolicy === 'fail') {
          throw new SecretsDetectedError(
            `Cannot scan ${filePath} for secrets: ${scanBytes} bytes exceeds the ${this.maxFileBytes}-byte scan limit`,
            [],
            { file: filePath, reason: 'unscannable' },
          );
        } else {
          this.log(`Excluding unscannable file: ${filePath} (too large to scan)`, 'warn');
          report?.add({
            path: filePath,
            size: file.size || 0,
            reason: EXCLUSION_REASONS.SECRET_UNSCANNABLE,
            rule: 'secretsGuard.maxFileBytes',
          });
          unscannableCount++;
          remember(unscannablePaths, filePath);
          continue;
        }
      }

      // Everything decidable from the manifest has now been applied. Scanning
      // needs bytes, which a dry run does not have.
      if (this.planOnly) {
        processedFiles.push(file);
        continue;
      }

      // Gitleaks is the stronger scanner, and a clean verdict from it is a
      // verdict — not a reason to run the weaker scanner over the same bytes.
      // Every clean file used to pay for both, which on a repository of mostly
      // clean files is the common case, not the exception. The built-in scanner
      // remains the fallback for when Gitleaks is absent or fails.
      // The first file with content to scan is what decides which scanner runs.
      await this._resolveScanner();

      const scan = await this._scan(file.content, filePath);

      // Gitleaks said this file contains a secret and then could not tell us
      // which one. That is not the same as a scanner that failed to run: a
      // positive verdict already exists, and the fallback scanner coming back
      // clean is a weaker tool disagreeing with a stronger one after the fact.
      // Emitting the file on the strength of the weaker answer is how the
      // guard's own detection ends up in the output.
      if (scan.detectedWithoutFindings) {
        // A detection is a detection. `--secrets fail` promises a non-zero exit
        // for any secret found, and "found one but could not say which" is not
        // the exception that promise carries.
        if (this.failOnSecrets) {
          throw new SecretsDetectedError(
            `Secrets detected in ${filePath}, but the scanner could not report which`,
            [],
            { file: filePath, reason: 'detectedWithoutFindings' },
          );
        }

        this.log(`Excluding ${filePath}: a secret was detected but could not be located`, 'warn');
        report?.add({
          path: filePath,
          size: file.size || 0,
          reason: EXCLUSION_REASONS.SECRET_DETECTED,
          rule: 'secretsGuard.detectedWithoutFindings',
        });
        redactionFailures++;
        excludedWithSecrets++;
        remember(excludedWithSecretsPaths, filePath);
        continue;
      }

      const fileFindings = scan.findings;

      if (fileFindings.length > 0) {
        // Raw findings carry the matched bytes, which redaction needs to locate
        // the span. Everything that leaves this stage gets the safe form: these
        // end up in `stats`, in events, and in thrown errors, all of which an
        // embedder is liable to log.
        const safeFindings = SecretRedactor.toSafeFindings(fileFindings);
        findings.push(...safeFindings);

        if (this.failOnSecrets) {
          throw new SecretsDetectedError(`Secrets detected in ${filePath}`, safeFindings, {
            file: filePath,
          });
        }

        if (this.redactInline) {
          // Only the built-in scanner reports the bytes it matched. Gitleaks
          // runs with `--redact`, so telling the redactor to trust its `Match`
          // would have it search the file for a mask — and, in a file that
          // happens to contain one, redact that decoy and leave the credential.
          const rawMatch = scan.scanner === 'builtin';
          const { content, count, covered, failed, markers } = SecretRedactor.redact(
            file.content,
            fileFindings,
            this.redactionMode,
            { rawMatch },
          );

          // Redaction is not proof of redaction. The scanner is the only thing
          // that can say whether a credential is still in the content, so it
          // gets the last word: whatever the coordinates claimed, the redacted
          // bytes go back through the same scanner, and anything it still finds
          // — that is not simply the marker the guard just wrote — means the
          // replacement missed. This is what makes the Gitleaks path
          // trustworthy at all; its masked matches leave every other check an
          // argument about coordinates rather than a measurement.
          let residue = [];
          let verificationFailed = false;

          if (covered) {
            const verification = await this._scan(content, filePath);

            // A verification is only evidence when the scanner that found the
            // secret is the one that says it is gone. If Gitleaks dies during
            // verification, the built-in scanner takes over and will happily
            // report a Gitleaks-only credential as clean — a weaker tool
            // overruling a stronger one, which is the same fail-open as
            // downgrading the original scan. The fallback still serves every
            // later file; this one is dropped.
            verificationFailed =
              verification.detectedWithoutFindings || verification.scanner !== scan.scanner;

            residue = SecretRedactor.residualFindings(content, verification.findings, markers, {
              rawMatch: verification.scanner === 'builtin',
            });
          }

          const proven = covered && !verificationFailed && residue.length === 0;

          // `covered` is the whole reason the redactor reports spans rather than
          // a count. A finding the redactor could not locate — drifted
          // coordinates, a match that survives outside every replaced region —
          // used to be skipped silently while the file went out stamped
          // `redacted: true`. Dropping the file is the only answer that keeps
          // the label honest.
          if (!proven) {
            const unresolved = covered ? residue.length || 1 : failed.length;
            this.log(
              `Excluding ${filePath}: ${unresolved} detected secret(s) could not be redacted`,
              'warn',
            );
            report?.add({
              path: filePath,
              size: file.size || 0,
              reason: EXCLUSION_REASONS.SECRET_DETECTED,
              rule: covered ? 'secretsGuard.redactionUnverified' : 'secretsGuard.redactionFailed',
            });
            redactionFailures += unresolved;
            excludedWithSecrets++;
            remember(excludedWithSecretsPaths, filePath);
            continue;
          }

          redactionCount += count;
          remember(redactedPaths, filePath);
          processedFiles.push({ ...file, content, redacted: true });
          continue;
        }

        // `redactInline: false` means "exclude rather than redact in place". It
        // used to mean "detect, report, and emit unchanged": execution fell
        // through to the push below with the credential still in the content,
        // while the run reported the finding as though the guard had acted on
        // it.
        this.log(`Excluding ${filePath}: secrets detected and inline redaction is off`, 'warn');
        report?.add({
          path: filePath,
          size: file.size || 0,
          reason: EXCLUSION_REASONS.SECRET_DETECTED,
          rule: 'secretsGuard.redactInline',
        });
        excludedWithSecrets++;
        remember(excludedWithSecretsPaths, filePath);
        continue;
      }

      processedFiles.push(file);
    }

    if (findings.length > 0) {
      // Debug, not warn: the redaction count reaches the reader on the run's
      // completion headline, in their words rather than this stage's. Emitting
      // it here as well said the same thing twice, once with a class name
      // attached, and did so regardless of --quiet.
      this.log(
        `Secrets Guard: detected ${findings.length} potential secret(s), redacted ${redactionCount}`,
        'debug',
      );
    }

    const degradations = [];

    if (this._degradation) {
      degradations.push({
        stage: this.name,
        code: 'SECRET_SCANNER_DEGRADED',
        message:
          `${this._degradation.from} failed, so the rest of this run was scanned ` +
          `by the ${this._degradation.to} scanner: ${this._degradation.reason}`,
      });
    }

    // A file dropped because its secrets could not be redacted is a safe
    // outcome, not a correct one: the caller asked for that file and did not
    // get it, and the reason is that the guard could not do its job on it.
    // `--strict` is exactly the flag for "tell me when the result is not the
    // one I asked for".
    if (redactionFailures > 0) {
      degradations.push({
        stage: this.name,
        code: 'SECRET_REDACTION_FAILED',
        message:
          `${redactionFailures} detected secret(s) could not be redacted, so ` +
          `${excludedWithSecrets} file(s) were excluded instead of redacted`,
      });
    }

    return {
      ...input,
      files: processedFiles,
      findings: [...(input.findings || []), ...findings],
      stats: {
        ...(input.stats || {}),
        // The scanner downgrade also goes in the general degradation list, not
        // only in the nested `secretsGuard.degraded`. `--strict` reads the
        // list, and "the credential scanner you asked for failed and a weaker
        // one finished the run" is the single degradation most worth refusing
        // a run over — it was the one the flag could not see.
        ...(degradations.length > 0
          ? { degradations: [...(input.stats?.degradations || []), ...degradations] }
          : {}),
        secretsGuard: {
          enabled: true,
          // Nothing was scanned in a plan, and nothing was scanned when every
          // file was excluded before it reached a scanner, so naming one in
          // either case would overstate what the numbers below mean.
          scanner: this._scannerName(),
          // Present only when the preferred scanner failed and a weaker one
          // finished the run. Its absence is the assertion that it did not.
          ...(this._degradation ? { degraded: this._degradation } : {}),
          planOnly: this.planOnly,
          findings: findings.length,
          redacted: redactionCount,
          excludedSecretFiles: excludedCount,
          excludedUnscannable: unscannableCount,
          // Files that held a detected secret and were removed rather than
          // emitted: either inline redaction is off, or a span could not be
          // proven redacted. `redactionFailures` counts the latter's findings.
          excludedWithSecrets,
          redactionFailures,
          // Sample paths, for a status line that can name what it is talking
          // about. Truncated at MAX_REPORTED_PATHS; the counts above are exact.
          excludedSecretFilePaths: excludedPaths,
          excludedUnscannablePaths: unscannablePaths,
          excludedWithSecretsPaths,
          redactedPaths,
          // `--secrets-report` reads this. The findings are already stripped of
          // the matched bytes, so the report is safe to write to a file or to
          // stdout; it carries positions, rule ids and fingerprints only.
          report: {
            scanner: this._scannerName(),
            ...(this._degradation ? { degraded: this._degradation } : {}),
            redactionMode: this.redactionMode,
            findings,
          },
        },
      },
    };
  }

  /**
   * The exclusion patterns, compiled once.
   *
   * `minimatch(path, pattern)` parses the pattern and builds a matcher on every
   * call, and this ran once per pattern per file — the default list against a
   * thousand files meant tens of thousands of throwaway parses. `Minimatch`
   * instances are the same matcher, built once and asked many times.
   *
   * @returns {import('minimatch').Minimatch[]} Compiled matchers
   * @private
   */
  get _excludeMatchers() {
    if (!this.__excludeMatchers) {
      this.__excludeMatchers = this.excludeGlobs.map(
        (pattern) =>
          new Minimatch(pattern, {
            dot: true,
            nocase: process.platform === 'win32',
            // Bare names like `id_rsa` and `*.pem` are meant at any depth.
            // Without this they only matched at the repository root, so
            // `keys/id_rsa` and `certs/server.pem` were scanned rather than
            // excluded — and the scanner's job on a private key is much harder
            // than simply not emitting it. Ignored by minimatch for patterns
            // containing a slash, so `.aws/credentials` keeps its path
            // semantics.
            matchBase: true,
          }),
      );
    }
    return this.__excludeMatchers;
  }

  _isExcluded(filePath) {
    return this._excludeMatchers.some((matcher) => matcher.match(filePath));
  }

  /**
   * Which scanner actually ran.
   *
   * `builtin` is only claimed once the built-in scanner has really been used.
   * A plan reads no bytes, and a selection whose every file was excluded as
   * secret-prone or unscannable never reaches a scanner at all — reporting a
   * scanner for those said protection had been applied to nothing.
   *
   * @returns {'none'|'gitleaks'|'builtin'} Scanner name for the stats block
   * @private
   */
  _scannerName() {
    if (this.planOnly || !this._scannerResolved) return 'none';
    if (this.useGitleaks) return 'gitleaks';
    // Gitleaks can fail on the only file of a run and be disabled without the
    // fallback ever running — a file excluded on a positive-but-unreadable
    // verdict never reaches a second scanner. Naming one then reported
    // protection that had been applied to nothing.
    return this._builtinScanned ? 'builtin' : 'none';
  }

  /**
   * Scan one piece of content with whichever scanner this run is using.
   *
   * Shared by the initial scan and by the verification re-scan of redacted
   * content, deliberately: a verification performed by a different scanner than
   * the one that found the secret proves nothing about that secret.
   *
   * A Gitleaks failure downgrades the run to the built-in scanner once, and is
   * reported once — the adapter opens its circuit on an operational failure, so
   * the condition will recur for every remaining file and a warning repeated a
   * thousand times buries the one line that explains the run.
   *
   * @param {string} content - Content to scan
   * @param {string} filePath - Logical path, for the scanner's report
   * @returns {Promise<{findings: Array, scanner: 'gitleaks'|'builtin', detectedWithoutFindings: boolean}>} Verdict
   * @private
   */
  async _scan(content, filePath) {
    if (this.useGitleaks) {
      try {
        const findings = await this.gitleaks.scanString(content, filePath, {
          signal: this.options?.signal,
        });
        return { findings, scanner: 'gitleaks', detectedWithoutFindings: false };
      } catch (error) {
        // A cancellation is not a scanner failure. The adapter rethrows it
        // unwrapped for exactly this reason; catching it here would turn an
        // abandoned run into a "degraded scan" and then carry on scanning every
        // remaining file with the fallback.
        if (isAbortError(error)) throw error;

        const detectedWithoutFindings = error.detectedWithoutFindings === true;

        if (!this._gitleaksFailureReported) {
          this._gitleaksFailureReported = true;
          this._degradation = {
            from: 'gitleaks',
            to: 'builtin',
            reason: error.message,
          };
          this.log(
            `Gitleaks scan failed (${error.message}); using the built-in scanner for the rest of this run`,
            'warn',
          );
        }
        this.useGitleaks = false;

        if (detectedWithoutFindings) {
          return { findings: [], scanner: 'gitleaks', detectedWithoutFindings: true };
        }
      }
    }

    this._builtinScanned = true;

    return {
      findings: scanContent(content, filePath),
      scanner: 'builtin',
      detectedWithoutFindings: false,
    };
  }
}

export default SecretsGuardStage;
