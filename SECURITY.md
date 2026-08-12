# Security Policy

## Supported Versions

Security updates are provided for the latest release only.

| Version      | Supported          | Notes                              |
| ------------ | ------------------ | ---------------------------------- |
| Latest 0.x   | :white_check_mark: | Fixes ship in a new patch release  |
| Older 0.x    | :x:                | Upgrade to the latest 0.x          |

This table describes the released package, which is currently `0.x`. It moves to
`1.x` in the same commit that sets the version to `1.0.0` — not before. Telling
people to "upgrade to 1.x" while the only published versions are `0.x` sends
them looking for a release that does not exist.

**This is a deliberately narrow promise.** CopyTree is maintained by one person.
A stated LTS window with backports to previous majors would be a commitment that
could not be honoured under load, and a support policy that is quietly missed is
worse than a modest one that is kept. If you need a longer window than this, say
so on the issue tracker rather than assuming it.

What is promised:

- A security fix ships as a patch release on the current minor, normally within
  a few days of a confirmed report.
- Breaking changes are never introduced in a security patch.
- The advisory names the affected versions and the first fixed version.

## Node.js Version Support

CopyTree requires **Node.js 22.12.0 or higher**, as declared by `engines` in `package.json`. We only support security issues on supported Node.js LTS versions.

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
- External sources are triggered by passing a URL as the path argument

### File System Access

CopyTree reads files from your local system:

- Respects `.gitignore` and `.copytreeignore` patterns
- **Does not follow symbolic links by default.** Enable with `followSymlinks: true`
- Binary files are handled according to configuration
- No files are modified or deleted by CopyTree

#### Symbolic links

Symlinks are skipped unless you opt in, because a link is untrusted input: it is
committed to a repository by whoever wrote the repository, and it can point
anywhere the running user can read. A single `ln -s ~/.ssh keys` would otherwise
place a private key into an AI context.

When `followSymlinks` is enabled, traversal is still contained:

- Every followed link is resolved with `realpath` and must land inside the real
  repository root. A link pointing outside is skipped and recorded in the
  exclusion report under `symlinkEscape`.
- The root is compared after resolution, so a repository you reached _through_
  a symlink still works normally.
- Directories reached through a link are tracked by device and inode (falling
  back to canonical path where inode is unavailable), so self-references,
  parent links, and multi-directory cycles terminate instead of recursing.
- Broken links are skipped rather than failing the run.

### Configuration Files

User configuration files are stored in:

- `~/.copytree/` (global)
- `.copytree/` (project-specific)

**A `.js` file in these directories is executed in the host process.** For an
application embedding CopyTree, that means arbitrary code from outside the
application's control running with its privileges. Embedders should construct a
hermetic configuration that never reads them:

```js
const config = await ConfigManager.create({
  userConfig: false, // skip ~/.copytree entirely
  strict: true, // fail loudly rather than continuing with a partial config
});
```

`strict` matters here: without it, a configuration source that fails to load
leaves the instance quietly empty, which means no exclusion lists at all. That
looks like a successful run and is not.

## Security Best Practices

When using CopyTree:

1. **External Sources**: Only include external sources from trusted repositories
2. **Configuration**: Review custom profiles and configuration files before use
3. **Output**: Review generated output before sharing, especially with AI tools
4. **Binary Files**: Be cautious with binary file handling in sensitive projects
5. **Secrets Detection**: On by default (`--secrets redact`). Use `--secrets fail` to refuse the export outright when a credential is found, or `--secrets off` to disable the guard. (`--secrets-guard` is the deprecated spelling and is hidden from help.)

## Known Limitations

- CopyTree shells out to `git` for repository operations
- External sources require network access
- Secret scanning runs on file content after transformation. Files larger than
  `secretsGuard.maxFileBytes` are excluded rather than emitted unscanned; set
  `secretsGuard.oversizePolicy` to `scan` or `fail` to choose differently
- Secret detection is best-effort. Gitleaks is used when available, with a
  smaller built-in pattern set otherwise. Neither finds every credential, so
  review output before sharing it

## Updates

Security updates will be published via:

- GitHub Security Advisories
- npm package updates
- CHANGELOG.md entries marked with `[SECURITY]`

## Contact

For security-related questions or concerns, contact: greg@siteorigin.com
