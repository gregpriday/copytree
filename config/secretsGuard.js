/**
 * Secret detection and redaction defaults.
 *
 * This file did not exist. Every value here was a `config.get(path, fallback)`
 * fallback buried in `SecretsGuardStage` or `GitleaksAdapter`, which made the
 * whole section invisible to `copytree config show --sources` — documented as
 * the fastest way to see every effective value and where it came from. A reader
 * checking whether redaction was on found no `secretsGuard` section at all and
 * could reasonably conclude the setting did not exist.
 *
 * The values match what the code fell back to, so this changes nothing about a
 * run; it changes what a run can tell you about itself.
 */

export default {
  enabled: true,

  // Files excluded outright, before anything is scanned. A private key is a
  // secret whether or not a scanner recognises the format, and not emitting it
  // is a much easier problem than redacting it correctly.
  exclude: [
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
  ],

  // Redact matches in place. `false` excludes the whole file instead — it never
  // means "emit it unchanged".
  redactInline: true,

  // What a marker reveals: `typed` names the rule, `generic` says nothing,
  // `hash` adds a short digest for correlating the same secret across runs.
  redactionMode: 'typed',

  // Largest file handed to a scanner. Beyond this the file is excluded rather
  // than emitted unscanned — see `oversizePolicy`.
  maxFileBytes: 5_000_000,

  // Exit non-zero on the first finding instead of redacting.
  failOnSecrets: false,

  // What to do with a file too large to scan. `scan` is the one option that
  // looks like protection and is not, so it has to be asked for by name.
  oversizePolicy: 'exclude',

  // The optional external scanner. `binaryPath` is resolved on PATH; the rest
  // are only meaningful when a custom build or ruleset is in use.
  gitleaks: {
    binaryPath: 'gitleaks',
    configPath: '',
    extraArgs: [],
    logLevel: 'fatal',
  },
};
