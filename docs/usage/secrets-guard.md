# Secrets Guard - Automatic Secret Detection and Redaction

Secrets Guard automatically scans your code for sensitive credentials and API keys before sharing with AI assistants or documentation tools. It prevents accidental leakage of secrets by using industry-standard detection tools.

## Quick Start

Secrets Guard is **enabled by default**. Just use CopyTree normally:

```bash
copytree
```

Output:
```
🔒 Secrets Guard: 2 files excluded, 3 secrets redacted
📎 144 files [980 KB] copied to clipboard
```

## How It Works

1. **Excludes high-risk files** entirely (.env, *.pem, credentials.json, etc.)
2. **Scans file content** using Gitleaks for 200+ secret patterns
3. **Redacts inline secrets** with typed markers like `***REDACTED:AWS-ACCESS-KEY***`
4. **Reports findings** without exposing the actual secret values

## Installation

### Install Gitleaks

**macOS:**
```bash
brew install gitleaks
```

**Linux:**
```bash
# Download latest release
curl -sSL https://github.com/gitleaks/gitleaks/releases/download/v8.19.0/gitleaks_8.19.0_linux_x64.tar.gz | tar -xz
sudo mv gitleaks /usr/local/bin/
```

**Windows:**
```powershell
# Using Chocolatey
choco install gitleaks

# Or Scoop
scoop install gitleaks
```

### Verify Installation

```bash
gitleaks version
```

**Note:** If Gitleaks is not installed, Secrets Guard will disable itself automatically and show a warning with installation instructions.

## CLI Options

### Enable/Disable

```bash
# Explicitly enable (default)
copytree --secrets-guard

# Disable for trusted repos
copytree --no-secrets-guard
```

### Redaction Modes

Choose how secrets are marked:

```bash
# Typed mode (default) - shows secret type
copytree --secrets-redact-mode typed
# Output: ***REDACTED:AWS-ACCESS-KEY***

# Generic mode - simple marker
copytree --secrets-redact-mode generic
# Output: ***REDACTED***

# Hash mode - includes hash for debugging
copytree --secrets-redact-mode hash
# Output: ***REDACTED:AWS-ACCESS-KEY:a3f5d9ab***
```

### CI Mode

Fail the build if secrets are found:

```bash
copytree --fail-on-secrets
```

Exit code will be non-zero if any secrets are detected, making it perfect for CI/CD pipelines.

## Configuration

### Global Config

Add to `~/.copytree/config/copytree.js`:

```javascript
module.exports = {
  secretsGuard: {
    enabled: true,
    redactionMode: 'typed',
    failOnSecrets: false,
    maxFileBytes: 1000000, // 1MB max file size to scan
    parallelism: 4, // Concurrent scans
    exclude: [
      // Additional patterns beyond defaults
      'internal-secrets.json',
    ],
    allowlist: [
      // Patterns to always allow (e.g., test fixtures)
      '**/test/fixtures/**',
      '**/examples/**',
    ],
    gitleaks: {
      binaryPath: 'gitleaks', // Custom path if needed
      configPath: null, // Path to .gitleaks.toml
    },
  },
};
```

### Project Config

Add to `.copytree.yaml`:

```yaml
secretsGuard:
  enabled: true
  redactionMode: typed
  exclude:
    - 'config/production.json'
  allowlist:
    - 'test/fixtures/*.env'
```

### Environment Variables

```bash
# Override config via environment
export COPYTREE_SECRETS_GUARD_ENABLED=true
export COPYTREE_SECRETS_GUARD_FAIL_ON_SECRETS=true
```

## Excluded File Patterns

These files are **always excluded** (never scanned or included):

**Environment files:**
- `.env`, `.env.*`, `.env.local`, `.env.production`, etc.

**Private keys:**
- `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.p8`
- `id_rsa`, `id_dsa`, `id_ecdsa`, `id_ed25519`

**Credentials:**
- `credentials.json`, `secrets.json`, `auth.json`
- `*-credentials.json`, `*-secrets.json`

**Service accounts:**
- `service-account-*.json`
- `firebase-adminsdk-*.json`
- `google-credentials.json`

**Keystores:**
- `*.jks`, `*.keystore`, `gradle.properties`

**Config files:**
- `.npmrc`, `.pypirc`, `.aws/credentials`, `.docker/config.json`

**Terraform:**
- `*.tfstate`, `*.tfstate.backup`

See full list in `src/pipeline/stages/SecretsGuardStage.js`

## Detected Secret Types

Gitleaks detects 200+ patterns including:

- **AWS**: Access keys (AKIA*, ASIA*), Secret keys
- **Google**: API keys (AIza*), Service account JSON
- **GitHub**: Tokens (ghp_*, github_pat_*)
- **Slack**: Tokens (xoxb-*, xoxp-*)
- **Private Keys**: RSA, DSA, EC, SSH keys
- **Database URLs**: With embedded credentials
- **JWT Tokens**: Bearer tokens
- **Generic Secrets**: High-entropy strings

## Handling False Positives

### Inline Suppression

Add `gitleaks:allow` comment on the same line:

```javascript
const testKey = "AKIAIOSFODNN7EXAMPLE"; // gitleaks:allow
```

### Allowlist Patterns

In config:

```javascript
allowlist: [
  '**/test/**',           // All test files
  '**/fixtures/**',       // Test fixtures
  '**/examples/**',       // Example code
  'docs/api-examples.md', // Specific files
]
```

### Custom Gitleaks Config

Create `.gitleaks.toml` to customize rules:

```toml
# Disable specific rules
[[rules]]
id = "generic-api-key"
enabled = false

# Adjust entropy threshold
[[rules]]
id = "high-entropy-string"
entropy = 5.0  # Increase to reduce false positives
```

Then configure CopyTree to use it:

```javascript
gitleaks: {
  configPath: './.gitleaks.toml'
}
```

## Examples

### Basic Usage

```bash
# Default: enabled, redacts inline with typed markers
copytree

# View only files that would be excluded
copytree --dry-run
```

### Development Workflow

```bash
# Working with trusted internal repo
copytree --no-secrets-guard

# Sharing code with AI (paranoid mode)
copytree --secrets-redact-mode generic --fail-on-secrets
```

### CI/CD Pipeline

```yaml
# GitHub Actions
- name: Check for secrets
  run: copytree --fail-on-secrets --dry-run

# GitLab CI
secrets_check:
  script:
    - copytree --fail-on-secrets --format json -o report.json
  artifacts:
    paths:
      - report.json
```

## Troubleshooting

### Gitleaks Not Found

**Problem:** Secrets Guard disabled with warning

**Solution:**
```bash
# macOS
brew install gitleaks

# Verify
gitleaks version
```

### Too Many False Positives

**Problem:** Legitimate code being redacted

**Solutions:**
1. Use inline `gitleaks:allow` comments
2. Add paths to allowlist
3. Create custom `.gitleaks.toml`
4. Disable specific rules

### Performance Issues

**Problem:** Scanning is slow

**Solutions:**
```javascript
// Reduce file size limit
maxFileBytes: 500000, // 500KB

// Increase parallelism
parallelism: 8,

// Skip large files entirely
exclude: ['*.bundle.js', '*.min.js']
```

### Binary Files

**Problem:** Binary files causing errors

**Solution:** Binary files are automatically skipped. No action needed.

## Security Considerations

### What Secrets Guard Does

- ✅ Detects 200+ known secret patterns
- ✅ Excludes obviously sensitive files
- ✅ Redacts secrets inline while preserving context
- ✅ Never logs or stores raw secret values
- ✅ Works in-memory (no temp files)

### What It Doesn't Do

- ❌ Not a substitute for `.gitignore`
- ❌ Not perfect - false negatives possible
- ❌ Doesn't scan git history
- ❌ Doesn't rotate leaked credentials
- ❌ Doesn't guarantee 100% detection

### Best Practices

1. **Defense in depth**: Use Secrets Guard + `.gitignore` + `.copytreeignore`
2. **Review output**: Check redactions make sense
3. **Allowlist sparingly**: Only for known-safe test data
4. **Rotate if leaked**: If a secret escapes, rotate it immediately
5. **Use secret managers**: Avoid hardcoded secrets entirely

## Reference

### Related Documentation

- [CLI Reference](../cli/copytree-reference.md)
- [Configuration Guide](./configuration.md)
- [Troubleshooting](./troubleshooting.md)

### External Resources

- [Gitleaks Documentation](https://github.com/gitleaks/gitleaks)
- [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [GitHub Secret Scanning](https://docs.github.com/en/code-security/secret-scanning)

---

**Need help?** Open an issue on [GitHub](https://github.com/gregpriday/copytree/issues)
