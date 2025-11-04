/**
 * Built-in secret detection patterns
 *
 * Comprehensive pattern library for detecting common secret types in code.
 * Each pattern includes metadata for proper handling and redaction.
 *
 * Pattern metadata:
 * - name: Unique identifier (used in redaction markers)
 * - pattern: RegExp for matching secrets
 * - description: Human-readable description
 * - severity: low, medium, high
 * - multiline: true for patterns spanning multiple lines
 * - ignoreCase: true for case-insensitive matching
 * - minEntropy: minimum Shannon entropy threshold (for generic patterns)
 * - redactionLabel: custom label for typed redaction mode
 *
 * @see https://github.com/gitleaks/gitleaks - Pattern inspiration
 * @see https://github.com/Yelp/detect-secrets - Additional patterns
 */

/**
 * @typedef {Object} SecretPatternSpec
 * @property {string} name - Pattern identifier
 * @property {RegExp} pattern - Detection regex
 * @property {string} description - Pattern description
 * @property {'low'|'medium'|'high'} severity - Risk severity
 * @property {boolean} [multiline] - Spans multiple lines
 * @property {boolean} [ignoreCase] - Case-insensitive matching
 * @property {number} [minEntropy] - Minimum entropy threshold
 * @property {string} [redactionLabel] - Custom redaction label
 */

/**
 * Built-in pattern library
 * @type {SecretPatternSpec[]}
 */
export const BUILTIN_PATTERNS = [
  // ============================================================================
  // Cloud Provider Keys
  // ============================================================================

  {
    name: 'aws-access-key',
    pattern: /\b((?:A3T[A-Z0-9]|AKIA|ASIA|AROA|AIDA|AGPA|ANPA|ANVA)[0-9A-Z]{16})\b/g,
    description: 'AWS Access Key ID (all prefixes: AKIA, ASIA, AROA, etc.)',
    severity: 'high',
    redactionLabel: 'AWS_ACCESS_KEY',
  },

  {
    name: 'aws-secret-key',
    pattern: /\b([A-Za-z0-9/+=]{40})\b/g,
    description: 'AWS Secret Access Key (40 chars, Base64-like)',
    severity: 'high',
    minEntropy: 4.5, // High entropy required to reduce false positives
    redactionLabel: 'AWS_SECRET_KEY',
  },

  {
    name: 'aws-session-token',
    pattern: /\b((?:F(?:Qo|wo)GZXIvYXdz|IQoJb3Jn)[A-Za-z0-9/+=]{80,})\b/g,
    description: 'AWS Session Token (FwoGZXIv..., IQoJb3Jn..., etc.)',
    severity: 'high',
    redactionLabel: 'AWS_SESSION_TOKEN',
  },

  {
    name: 'google-api-key',
    pattern: /\b(AIza[0-9A-Za-z_-]{35})\b/g,
    description: 'Google API Key',
    severity: 'high',
    redactionLabel: 'GOOGLE_API_KEY',
  },

  {
    name: 'google-oauth',
    pattern: /\b([0-9]+-[0-9A-Za-z_]{32}\.apps\.googleusercontent\.com)\b/g,
    description: 'Google OAuth Client ID',
    severity: 'medium',
    redactionLabel: 'GOOGLE_OAUTH',
  },

  {
    name: 'azure-client-secret',
    pattern: /\b([a-zA-Z0-9~._-]{34,40})\b/g,
    description: 'Azure Client Secret',
    severity: 'high',
    minEntropy: 4.2,
    redactionLabel: 'AZURE_CLIENT_SECRET',
  },

  {
    name: 'digitalocean-token',
    pattern: /\b(dop_v1_[a-f0-9]{64})\b/g,
    description: 'DigitalOcean Personal Access Token',
    severity: 'high',
    redactionLabel: 'DIGITALOCEAN_TOKEN',
  },

  {
    name: 'heroku-api-key',
    pattern: /\b([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\b/g,
    description: 'Heroku API Key (UUID format)',
    severity: 'high',
    redactionLabel: 'HEROKU_API_KEY',
  },

  // ============================================================================
  // Authentication Tokens
  // ============================================================================

  {
    name: 'jwt',
    pattern: /\b(eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+)\b/g,
    description: 'JSON Web Token (JWT)',
    severity: 'high',
    redactionLabel: 'JWT',
  },

  {
    name: 'bearer-token',
    pattern: /\bBearer\s+([a-zA-Z0-9_\-.~+/]+=*)\b/gi,
    description: 'Bearer Token',
    severity: 'high',
    ignoreCase: true,
    redactionLabel: 'BEARER_TOKEN',
  },

  {
    name: 'oauth-token',
    pattern: /\b(oauth[_-]?token["']?\s*[:=]\s*["']?)([a-zA-Z0-9_-]{32,})(["']?)/gi,
    description: 'OAuth Token Assignment',
    severity: 'high',
    ignoreCase: true,
    redactionLabel: 'OAUTH_TOKEN',
  },

  // ============================================================================
  // API Keys (Popular Services)
  // ============================================================================

  {
    name: 'stripe-key',
    pattern: /\b((sk|pk|rk)_(test|live)_[0-9a-zA-Z]{24,})\b/g,
    description: 'Stripe API Key (secret, publishable, restricted)',
    severity: 'high',
    redactionLabel: 'STRIPE_KEY',
  },

  {
    name: 'slack-token',
    pattern: /\b(xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[0-9a-zA-Z]{24,})\b/g,
    description: 'Slack Token',
    severity: 'high',
    redactionLabel: 'SLACK_TOKEN',
  },

  {
    name: 'slack-webhook',
    pattern: /https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[a-zA-Z0-9]+/g,
    description: 'Slack Webhook URL',
    severity: 'medium',
    redactionLabel: 'SLACK_WEBHOOK',
  },

  {
    name: 'github-token',
    pattern: /\b(gh[pousr]_[A-Za-z0-9_]{36,})\b/g,
    description: 'GitHub Personal Access Token',
    severity: 'high',
    redactionLabel: 'GITHUB_TOKEN',
  },

  {
    name: 'github-oauth',
    pattern: /\b(gho_[A-Za-z0-9]{36})\b/g,
    description: 'GitHub OAuth Token',
    severity: 'high',
    redactionLabel: 'GITHUB_OAUTH',
  },

  {
    name: 'sendgrid-api-key',
    pattern: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g,
    description: 'SendGrid API Key',
    severity: 'high',
    redactionLabel: 'SENDGRID_KEY',
  },

  {
    name: 'twilio-api-key',
    pattern: /\bSK[a-f0-9]{32}\b/g,
    description: 'Twilio API Key',
    severity: 'high',
    redactionLabel: 'TWILIO_KEY',
  },

  {
    name: 'mailgun-api-key',
    pattern: /\b(key-[a-f0-9]{32})\b/g,
    description: 'Mailgun API Key',
    severity: 'high',
    redactionLabel: 'MAILGUN_KEY',
  },

  {
    name: 'npm-token',
    pattern: /\b(npm_[a-zA-Z0-9]{36})\b/g,
    description: 'NPM Access Token',
    severity: 'high',
    redactionLabel: 'NPM_TOKEN',
  },

  {
    name: 'pypi-token',
    pattern: /\b(pypi-[A-Za-z0-9_-]{64,})\b/g,
    description: 'PyPI Upload Token',
    severity: 'high',
    redactionLabel: 'PYPI_TOKEN',
  },

  // ============================================================================
  // Database Credentials
  // ============================================================================

  {
    name: 'database-url',
    pattern:
      /(postgres|postgresql|mysql|mongodb|redis):\/\/[^:\s]+:[^@\s]+@[a-zA-Z0-9.-]+(?::[0-9]+)?(?:\/[^\s]*)?/gi,
    description: 'Database Connection URL with embedded credentials',
    severity: 'high',
    ignoreCase: true,
    redactionLabel: 'DATABASE_URL',
  },

  {
    name: 'connection-string',
    pattern: /(?:server|host|data source)=[^;]+;[^;]*(?:password|pwd)=[^;]+(?:;[^;]+)*/gi,
    description: 'Database Connection String with password',
    severity: 'high',
    ignoreCase: true,
    redactionLabel: 'CONNECTION_STRING',
  },

  {
    name: 'mongodb-uri',
    pattern:
      /mongodb(?:\+srv)?:\/\/[a-zA-Z0-9_-]+:[a-zA-Z0-9_!@#$%^&*()+={}\-[\]:;<>,.?/|`~]+@[a-zA-Z0-9.-]+(?::[0-9]+)?(?:\/[^\s]*)?/gi,
    description: 'MongoDB Connection URI with credentials',
    severity: 'high',
    ignoreCase: true,
    redactionLabel: 'MONGODB_URI',
  },

  // ============================================================================
  // Private Keys
  // ============================================================================

  {
    name: 'rsa-private-key',
    pattern: /-----BEGIN RSA PRIVATE KEY-----[\s\S]*?-----END RSA PRIVATE KEY-----/g,
    description: 'RSA Private Key',
    severity: 'high',
    multiline: true,
    redactionLabel: 'RSA_PRIVATE_KEY',
  },

  {
    name: 'openssh-private-key',
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]*?-----END OPENSSH PRIVATE KEY-----/g,
    description: 'OpenSSH Private Key',
    severity: 'high',
    multiline: true,
    redactionLabel: 'SSH_PRIVATE_KEY',
  },

  {
    name: 'ec-private-key',
    pattern: /-----BEGIN EC PRIVATE KEY-----[\s\S]*?-----END EC PRIVATE KEY-----/g,
    description: 'EC Private Key',
    severity: 'high',
    multiline: true,
    redactionLabel: 'EC_PRIVATE_KEY',
  },

  {
    name: 'dsa-private-key',
    pattern: /-----BEGIN DSA PRIVATE KEY-----[\s\S]*?-----END DSA PRIVATE KEY-----/g,
    description: 'DSA Private Key',
    severity: 'high',
    multiline: true,
    redactionLabel: 'DSA_PRIVATE_KEY',
  },

  {
    name: 'pgp-private-key',
    pattern: /-----BEGIN PGP PRIVATE KEY BLOCK-----[\s\S]*?-----END PGP PRIVATE KEY BLOCK-----/g,
    description: 'PGP Private Key Block',
    severity: 'high',
    multiline: true,
    redactionLabel: 'PGP_PRIVATE_KEY',
  },

  {
    name: 'private-key-generic',
    pattern: /-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g,
    description: 'Generic PKCS#8 Private Key',
    severity: 'high',
    multiline: true,
    redactionLabel: 'PRIVATE_KEY',
  },

  // ============================================================================
  // Generic Patterns (with entropy thresholds)
  // ============================================================================

  {
    name: 'password-assignment',
    pattern: /(password|passwd|pwd)["']?\s*[:=]\s*["']([^"'\s]{8,})["']/gi,
    description: 'Password assignment in code',
    severity: 'medium',
    ignoreCase: true,
    minEntropy: 3.5,
    redactionLabel: 'PASSWORD',
  },

  {
    name: 'secret-assignment',
    pattern: /(secret|api[_-]?key|apikey|access[_-]?token)["']?\s*[:=]\s*["']([^"'\s]{16,})["']/gi,
    description: 'Secret/API key assignment in code',
    severity: 'high',
    ignoreCase: true,
    minEntropy: 4.0,
    redactionLabel: 'SECRET',
  },

  {
    name: 'authorization-header',
    pattern: /(authorization|auth)["']?\s*:\s*["']([^"'\s]{20,})["']/gi,
    description: 'Authorization header value',
    severity: 'high',
    ignoreCase: true,
    minEntropy: 4.0,
    redactionLabel: 'AUTH_HEADER',
  },

  {
    name: 'private-key-env',
    pattern: /(private[_-]?key|secret[_-]?key)["']?\s*[:=]\s*["']([^"'\s]{32,})["']/gi,
    description: 'Private/secret key in environment variable',
    severity: 'high',
    ignoreCase: true,
    minEntropy: 4.0,
    redactionLabel: 'PRIVATE_KEY_ENV',
  },
];

/**
 * Pattern validation errors
 */
export class SecretPatternError extends Error {
  constructor(message, pattern, details = {}) {
    super(message);
    this.name = 'SecretPatternError';
    this.pattern = pattern;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validate pattern specification
 *
 * @param {SecretPatternSpec} spec - Pattern to validate
 * @throws {SecretPatternError} If pattern is invalid
 */
export function validatePattern(spec) {
  if (!spec.name || typeof spec.name !== 'string') {
    throw new SecretPatternError('Pattern must have a valid name', spec);
  }

  if (!(spec.pattern instanceof RegExp)) {
    throw new SecretPatternError(`Pattern "${spec.name}" must be a RegExp`, spec);
  }

  if (!spec.pattern.flags.includes('g')) {
    throw new SecretPatternError(`Pattern "${spec.name}" must have global flag (g)`, spec);
  }

  if (!spec.description) {
    throw new SecretPatternError(`Pattern "${spec.name}" must have a description`, spec);
  }

  if (!['low', 'medium', 'high'].includes(spec.severity)) {
    throw new SecretPatternError(
      `Pattern "${spec.name}" must have severity: low, medium, or high`,
      spec,
    );
  }

  // Validate minEntropy if present
  if (spec.minEntropy !== undefined) {
    if (typeof spec.minEntropy !== 'number' || spec.minEntropy < 0) {
      throw new SecretPatternError(
        `Pattern "${spec.name}" minEntropy must be a positive number`,
        spec,
      );
    }
  }
}

/**
 * Validate all built-in patterns
 * Called at module load time to ensure correctness
 *
 * @throws {SecretPatternError} If any pattern is invalid
 */
export function validateAllPatterns() {
  const names = new Set();

  for (const pattern of BUILTIN_PATTERNS) {
    validatePattern(pattern);

    // Check for duplicate names
    if (names.has(pattern.name)) {
      throw new SecretPatternError(`Duplicate pattern name: ${pattern.name}`, pattern);
    }
    names.add(pattern.name);
  }
}

// Validate patterns at module load time
validateAllPatterns();

/**
 * Get pattern by name
 *
 * @param {string} name - Pattern name
 * @returns {SecretPatternSpec|undefined} Pattern spec or undefined
 */
export function getPatternByName(name) {
  return BUILTIN_PATTERNS.find((p) => p.name === name);
}

/**
 * Get all patterns by severity
 *
 * @param {'low'|'medium'|'high'} severity - Severity level
 * @returns {SecretPatternSpec[]} Patterns matching severity
 */
export function getPatternsBySeverity(severity) {
  return BUILTIN_PATTERNS.filter((p) => p.severity === severity);
}

/**
 * Get high-severity patterns only
 *
 * @returns {SecretPatternSpec[]} High-severity patterns
 */
export function getHighSeverityPatterns() {
  return getPatternsBySeverity('high');
}
