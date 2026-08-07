import Stage from '../Stage.js';
import GitleaksAdapter from '../../services/GitleaksAdapter.js';
import SecretRedactor from '../../utils/SecretRedactor.js';
import { SecretsDetectedError } from '../../utils/errors.js';
import { EXCLUSION_REASONS } from '../../utils/exclusionReport.js';
import { scanContent } from '../../utils/secretPatterns.js';
import { minimatch } from 'minimatch';

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
    this.gitleaks = new GitleaksAdapter(options.gitleaks || {});
    this.useGitleaks = false;
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
    this.maxFileBytes =
      options.maxFileBytes || this.config.get('secretsGuard.maxFileBytes', 5_000_000);
    this.failOnSecrets =
      options.failOnSecrets ?? this.config.get('secretsGuard.failOnSecrets', false);

    // What to do with a file too large to scan. Including it unscanned is the
    // one option that looks like protection and is not, so it is not the
    // default and has to be asked for by name.
    this.oversizePolicy =
      options.oversizePolicy || this.config.get('secretsGuard.oversizePolicy', 'exclude');

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

    if (!this.enabled || this.planOnly) return;

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
    // Which files, not just how many. "1 secret-prone file left out" tells the
    // reader something happened but not whether it mattered; naming `.env` ends
    // the question. Capped so a repository full of key material cannot turn one
    // status line into a wall of text — the count still reports the total.
    const excludedPaths = [];
    const unscannablePaths = [];
    const redactedPaths = [];
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

      let fileFindings = [];

      if (this.useGitleaks) {
        try {
          fileFindings = await this.gitleaks.scanString(file.content, filePath);
        } catch (error) {
          this.log(`Gitleaks scan failed for ${filePath}: ${error.message}`, 'warn');
        }
      }

      if (!this.useGitleaks || fileFindings.length === 0) {
        fileFindings = this._basicScan(file);
      }

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
          const { content, count } = SecretRedactor.redact(
            file.content,
            fileFindings,
            this.redactionMode,
          );
          redactionCount += count;
          remember(redactedPaths, filePath);
          processedFiles.push({ ...file, content, redacted: true });
          continue;
        }
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

    return {
      ...input,
      files: processedFiles,
      findings: [...(input.findings || []), ...findings],
      stats: {
        ...(input.stats || {}),
        secretsGuard: {
          enabled: true,
          // Nothing was scanned in a plan, so naming a scanner would overstate
          // what the numbers below mean.
          scanner: this.planOnly ? 'none' : this.useGitleaks ? 'gitleaks' : 'builtin',
          planOnly: this.planOnly,
          findings: findings.length,
          redacted: redactionCount,
          excludedSecretFiles: excludedCount,
          excludedUnscannable: unscannableCount,
          // Sample paths, for a status line that can name what it is talking
          // about. Truncated at MAX_REPORTED_PATHS; the counts above are exact.
          excludedSecretFilePaths: excludedPaths,
          excludedUnscannablePaths: unscannablePaths,
          redactedPaths,
          // `--secrets-report` reads this. The findings are already stripped of
          // the matched bytes, so the report is safe to write to a file or to
          // stdout; it carries positions, rule ids and fingerprints only.
          report: {
            scanner: this.planOnly ? 'none' : this.useGitleaks ? 'gitleaks' : 'builtin',
            redactionMode: this.redactionMode,
            findings,
          },
        },
      },
    };
  }

  _isExcluded(filePath) {
    return this.excludeGlobs.some((pattern) =>
      minimatch(filePath, pattern, {
        dot: true,
        nocase: process.platform === 'win32',
        // Bare names like `id_rsa` and `*.pem` are meant at any depth. Without
        // this they only matched at the repository root, so `keys/id_rsa` and
        // `certs/server.pem` were scanned rather than excluded — and the
        // scanner's job on a private key is much harder than simply not
        // emitting it. Ignored by minimatch for patterns containing a slash, so
        // `.aws/credentials` keeps its path semantics.
        matchBase: true,
      }),
    );
  }

  _basicScan(file) {
    return scanContent(file.content, file.relativePath || file.path);
  }
}

export default SecretsGuardStage;
