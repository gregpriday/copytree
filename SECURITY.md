# Security Policy

## Supported Versions

CopyTree is currently in **pre-release** (0.x versions). Security updates are provided for:

| Version | Supported          | Notes                                    |
| ------- | ------------------ | ---------------------------------------- |
| 0.x     | :white_check_mark: | Latest 0.x release only (pre-release)    |
| < 0.x   | :x:                | Upgrade to latest 0.x                    |

**Post-1.0 Support Policy**: Once we release 1.0.0, we will adopt an LTS (Long Term Support) approach with:
- Security updates for all 1.x minor versions for 12 months
- Critical security fixes backported to the previous major version for 6 months
- Clear end-of-life dates announced in advance

## Node.js Version Support

CopyTree requires **Node.js 20.0.0 or higher**. We only support security issues on supported Node.js LTS versions.

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue in CopyTree, please report it responsibly:

### How to Report

**DO NOT** create a public GitHub issue for security vulnerabilities.

Instead, please email security reports to: **greg@siteorigin.com**

Include in your report:
- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact
- Any suggested fixes (optional)

### What to Expect

- **Acknowledgment**: We'll acknowledge receipt within 48 hours
- **Initial Assessment**: We'll provide an initial assessment within 5 business days
- **Updates**: We'll keep you informed of progress toward a fix
- **Disclosure**: Once fixed, we'll coordinate disclosure timing with you
- **Credit**: We'll credit you in the security advisory (unless you prefer to remain anonymous)

## Security Considerations

### External Sources

CopyTree can fetch files from external sources (GitHub repositories). Be aware:

- External sources are fetched over HTTPS
- Git commands are executed via `simple-git` library
- No arbitrary command execution from external sources
- External sources can be disabled by not using the `--external` flag

### AI Provider Integration

CopyTree integrates with AI providers (Google Gemini by default):

- API keys are read from environment variables
- API keys are never logged or written to files
- AI features are opt-in via specific transformers
- Caching can be disabled with `--no-cache`

### File System Access

CopyTree reads files from your local system:

- Respects `.gitignore` and `.copytreeignore` patterns
- Follows symbolic links by default (can be disabled)
- Binary files are handled according to configuration
- No files are modified or deleted by CopyTree

### Configuration Files

User configuration files are stored in:
- `~/.copytree/` (global)
- `.copytree/` (project-specific)

These files are executed as JavaScript/JSON. Only use configuration files from trusted sources.

## Security Best Practices

When using CopyTree:

1. **API Keys**: Store API keys in environment variables, never commit them
2. **External Sources**: Only include external sources from trusted repositories
3. **Configuration**: Review custom profiles and configuration files before use
4. **Output**: Review generated output before sharing, especially with AI tools
5. **Binary Files**: Be cautious with binary file handling in sensitive projects

## Known Limitations

- CopyTree shells out to `git` for repository operations
- External sources require network access
- AI transformers send file contents to third-party APIs (opt-in)

## Updates

Security updates will be published via:
- GitHub Security Advisories
- npm package updates
- CHANGELOG.md entries marked with `[SECURITY]`

## Contact

For security-related questions or concerns, contact: greg@siteorigin.com
