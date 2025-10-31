import Stage from '../Stage.js';
import GitleaksAdapter from '../../services/GitleaksAdapter.js';
import SecretRedactor from '../../utils/SecretRedactor.js';
import { SecretsDetectedError } from '../../utils/errors.js';
import { minimatch } from 'minimatch';
import pLimit from 'p-limit';

/**
 * High-risk file patterns that should be excluded entirely
 * These files are never processed or included in output
 */
const SECRET_FILE_PATTERNS = [
  // Environment files
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.env.test',
  '.env.*',

  // Private keys
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

  // Credentials
  'credentials.json',
  'credentials.yml',
  'credentials.yaml',
  'secrets.json',
  'secrets.yml',
  'secrets.yaml',
  'secrets.*.json',
  'secrets.*.yml',
  'secrets.*.yaml',
  'auth.json',
  '*-credentials.json',
  '*-secrets.json',

  // Service accounts
  'service-account-*.json',
  'firebase-adminsdk-*.json',
  'google-credentials.json',
  'gcloud-service-key.json',

  // Keystores & signing
  '*.jks',
  '*.keystore',
  '*.keystore.properties',
  '*.mobileprovision',
  'gradle.properties',

  // Package registries
  '.npmrc',
  '.pypirc',
  '.gem/credentials',

  // Cloud/CLI config
  '.aws/credentials',
  '.kube/config',
  '.config/gcloud/**',

  // Docker
  '.docker/config.json',

  // Terraform state
  '*.tfstate',
  '*.tfstate.backup',

  // Misc
  '*.ovpn',
  '*.htpasswd',
];

/**
 * SecretsGuardStage - Automatic secret detection and redaction
 *
 * Scans file content for secrets using Gitleaks and redacts them inline.
 * Excludes high-risk files entirely. Provides reporting and optional CI gating.
 *
 * Position in pipeline: After FileDiscoveryStage, before ProfileFilterStage
 */
class SecretsGuardStage extends Stage {
  constructor(options = {}) {
    super(options);

    // Configuration from options or config
    this.enabled = options.enabled ?? this.config.get('secretsGuard.enabled', true);
    this.excludeGlobs =
      options.excludeGlobs || this.config.get('secretsGuard.exclude', SECRET_FILE_PATTERNS);
    this.allowlistGlobs = options.allowlistGlobs || this.config.get('secretsGuard.allowlist', []);
    this.redactInline = options.redactInline ?? this.config.get('secretsGuard.redactInline', true);
    this.redactionMode =
      options.redactionMode || this.config.get('secretsGuard.redactionMode', 'typed');
    this.maxFileBytes =
      options.maxFileBytes || this.config.get('secretsGuard.maxFileBytes', 1_000_000); // 1MB default
    this.parallelism = options.parallelism || this.config.get('secretsGuard.parallelism', 4);
    this.failOnSecrets =
      options.failOnSecrets ?? this.config.get('secretsGuard.failOnSecrets', false);

    // Initialize Gitleaks adapter
    const gitleaksConfig = options.gitleaks || this.config.get('secretsGuard.gitleaks', {});
    this.gitleaks = new GitleaksAdapter(gitleaksConfig);

    // Tracking
    this.filesExcluded = 0;
    this.secretsFound = 0;
    this.secretsRedacted = 0;
    this.excludedFiles = [];
    this.allFindings = [];
  }

  async onInit(context) {
    // Check if gitleaks is available
    if (this.enabled) {
      const available = await this.gitleaks.isAvailable();
      if (!available) {
        this.log(
          'Secrets Guard disabled: gitleaks not found. Install: brew install gitleaks',
          'warn',
        );
        this.enabled = false;
      } else {
        const version = await this.gitleaks.getVersion();
        this.log(`Secrets Guard enabled (gitleaks ${version || 'unknown'})`, 'debug');
      }
    }
  }

  async process(input) {
    if (!this.enabled) {
      this.log('Secrets Guard disabled - skipping', 'debug');
      return input;
    }

    const { files = [] } = input;
    this.log(`Scanning ${files.length} files for secrets`, 'info');

    const startTime = Date.now();

    // Process files with limited concurrency
    const limit = pLimit(this.parallelism);
    const processedFiles = await Promise.all(
      files.map((file) => limit(() => this.processFile(file))),
    );

    // Filter out excluded files
    const finalFiles = processedFiles.filter((f) => !f.secretsExcluded);

    const duration = this.getElapsedTime(startTime);
    this.log(
      `Secrets Guard: ${this.filesExcluded} files excluded, ${this.secretsRedacted} secrets redacted in ${duration}`,
      'info',
    );

    // Fail if configured and secrets found
    if (this.failOnSecrets && this.secretsFound > 0) {
      // Prepare sanitized findings (never include raw secrets)
      const sanitizedFindings = this.allFindings.map((f) => ({
        file: f.file,
        line: f.line,
        rule: f.rule,
      }));

      throw new SecretsDetectedError(this.secretsFound, sanitizedFindings, {
        filesExcluded: this.filesExcluded,
        secretsRedacted: this.secretsRedacted,
      });
    }

    return {
      ...input,
      files: finalFiles,
      stats: {
        ...(input.stats || {}),
        secretsGuard: {
          filesExcluded: this.filesExcluded,
          secretsFound: this.secretsFound,
          secretsRedacted: this.secretsRedacted,
          filesScanned: files.length - this.filesExcluded,
        },
      },
    };
  }

  async processFile(file) {
    // Check if file should be excluded entirely
    if (this.shouldExcludeFile(file.path)) {
      this.filesExcluded++;
      this.excludedFiles.push(file.path);
      this.emitFileEvent(file.path, 'excluded-secret-file');
      return { ...file, secretsExcluded: true };
    }

    // Check if file is in allowlist
    if (this.isAllowlisted(file.path)) {
      this.emitFileEvent(file.path, 'allowlisted');
      return file;
    }

    // Skip binary files
    if (file.isBinary) {
      this.emitFileEvent(file.path, 'skipped-binary');
      return file;
    }

    // Skip files that are too large
    if (file.size && file.size > this.maxFileBytes) {
      this.log(`Skipping ${file.path}: too large (${this.formatBytes(file.size)})`, 'debug');
      this.emitFileEvent(file.path, 'skipped-large');
      return file;
    }

    // Skip files without content
    if (!file.content) {
      return file;
    }

    // Scan content with gitleaks
    try {
      const findings = await this.gitleaks.scanString(file.content, file.path);

      if (findings.length === 0) {
        this.emitFileEvent(file.path, 'scanned-clean');
        return file;
      }

      // Track findings
      this.secretsFound += findings.length;
      this.allFindings.push(
        ...findings.map((f) => ({
          file: file.path,
          line: f.StartLine,
          rule: f.RuleID,
        })),
      );

      this.emitFileEvent(file.path, `secrets-found-${findings.length}`);

      // Redact secrets if enabled
      if (!this.redactInline) {
        // Exclude file entirely if redaction disabled
        this.filesExcluded++;
        this.excludedFiles.push(file.path);
        return { ...file, secretsExcluded: true };
      }

      // Apply redaction
      const { content, count } = SecretRedactor.redact(file.content, findings, this.redactionMode);

      this.secretsRedacted += count;

      return {
        ...file,
        content,
        secretsRedacted: true,
        secretsCount: findings.length,
      };
    } catch (error) {
      // Log error but don't fail the file
      this.log(`Error scanning ${file.path}: ${error.message}`, 'warn');
      this.emitFileEvent(file.path, 'scan-error');
      return file;
    }
  }

  /**
   * Check if file should be excluded based on hard-deny patterns
   * @param {string} filePath - File path to check
   * @returns {boolean} True if file should be excluded
   */
  shouldExcludeFile(filePath) {
    // Normalize path separators
    const normalized = filePath.replace(/\\/g, '/');

    // Check against all exclude patterns
    for (const pattern of this.excludeGlobs) {
      if (minimatch(normalized, pattern, { dot: true })) {
        return true;
      }

      // Also check basename for patterns like ".env"
      const basename = normalized.split('/').pop();
      if (minimatch(basename, pattern, { dot: true })) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if file is in allowlist
   * @param {string} filePath - File path to check
   * @returns {boolean} True if file is allowlisted
   */
  isAllowlisted(filePath) {
    if (this.allowlistGlobs.length === 0) {
      return false;
    }

    const normalized = filePath.replace(/\\/g, '/');

    for (const pattern of this.allowlistGlobs) {
      if (minimatch(normalized, pattern, { dot: true })) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get summary of findings (sanitized, no raw secrets)
   * @returns {Object} Summary object
   */
  getSummary() {
    return {
      filesExcluded: this.filesExcluded,
      secretsFound: this.secretsFound,
      secretsRedacted: this.secretsRedacted,
      findings: this.allFindings.map((f) => ({
        file: f.file,
        line: f.line,
        rule: f.rule,
      })),
    };
  }
}

export default SecretsGuardStage;
