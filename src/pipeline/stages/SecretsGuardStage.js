import Stage from '../Stage.js';
import GitleaksAdapter from '../../services/GitleaksAdapter.js';
import SecretRedactor from '../../utils/SecretRedactor.js';
import { SecretsDetectedError } from '../../utils/errors.js';
import { EXCLUSION_REASONS } from '../../utils/exclusionReport.js';
import { minimatch } from 'minimatch';

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

const BASIC_PATTERNS = [
  { id: 'AWS_ACCESS_KEY', regex: /AKIA[0-9A-Z]{16}/gi },
  {
    id: 'AWS_SECRET_KEY',
    regex: /aws(.{0,20})?(secret|access)[^\s]{0,5}['"`]?[A-Za-z0-9/+=]{32,40}['"`]?/gi,
  },
  { id: 'PRIVATE_KEY', regex: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/gi },
  { id: 'GENERIC_TOKEN', regex: /(api|secret|token|password)[\s:=]{1,4}[A-Za-z0-9._-]{12,}/gi },
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
  }

  async onInit(context) {
    await super.onInit(context);
    this._resolveSettings();

    if (!this.enabled) return;

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
        continue;
      }

      if (!file.content) {
        processedFiles.push(file);
        continue;
      }

      if (Buffer.byteLength(file.content, 'utf8') > this.maxFileBytes) {
        // Emitting a file the scanner could not read, while reporting that
        // secrets protection is on, is the least safe reading of "too large".
        if (this.oversizePolicy === 'scan') {
          this.log(`Scanning oversize file ${filePath} (oversizePolicy: scan)`, 'debug');
        } else if (this.oversizePolicy === 'fail') {
          throw new SecretsDetectedError(
            `Cannot scan ${filePath} for secrets: ${file.content.length} characters exceeds the ${this.maxFileBytes}-byte scan limit`,
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
          continue;
        }
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
          processedFiles.push({ ...file, content, redacted: true });
          continue;
        }
      }

      processedFiles.push(file);
    }

    if (findings.length > 0) {
      this.log(
        `Secrets Guard: detected ${findings.length} potential secret(s), redacted ${redactionCount}`,
        'warn',
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
          scanner: this.useGitleaks ? 'gitleaks' : 'builtin',
          findings: findings.length,
          redacted: redactionCount,
          excludedSecretFiles: excludedCount,
          excludedUnscannable: unscannableCount,
        },
      },
    };
  }

  _isExcluded(filePath) {
    return this.excludeGlobs.some((pattern) =>
      minimatch(filePath, pattern, { dot: true, nocase: process.platform === 'win32' }),
    );
  }

  _basicScan(file) {
    const results = [];
    for (const pattern of BASIC_PATTERNS) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      let match;
      while ((match = regex.exec(file.content)) !== null) {
        const { line, column } = this._positionFromIndex(file.content, match.index);
        results.push({
          RuleID: pattern.id,
          StartLine: line,
          EndLine: line,
          StartColumn: column,
          EndColumn: column + match[0].length,
          Match: match[0],
          File: file.relativePath || file.path,
        });
      }
    }
    return results;
  }

  _positionFromIndex(content, index) {
    const snippet = content.slice(0, index);
    const lines = snippet.split('\n');
    const line = lines.length;
    const column = (lines[lines.length - 1] || '').length + 1;
    return { line, column };
  }
}

export default SecretsGuardStage;
