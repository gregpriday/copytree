# DDR-0001: Profiles and Transformers - Canonical Rules

**Status**: Active
**Date**: 2025-01-03
**Author**: CopyTree Documentation Team

## Context

The CopyTree documentation had critical contradictions regarding how profiles work and how transformers are configured. This DDR establishes the canonical truth for these fundamental behaviors to prevent future documentation drift.

## Decisions

### Profile Selection

**Canonical Rule**: CopyTree uses a built-in default profile automatically unless overridden.

**Selection Order**:
1. If `--profile <name>` flag is provided → use the specified profile
2. Else → use the built-in default profile automatically

**Profile Search Paths** (when loading by name):
1. Project directory: `.copytree/<name>.yml`
2. User directory: `~/.copytree/profiles/<name>.yml`
3. Built-in directory: `profiles/<name>.yml` (package installation)

**Code Reference**: `src/profiles/ProfileLoader.js` lines 113-142, `src/commands/copy.js` line 49

### Default Profile Behavior

The built-in default profile (`profiles/default.yml`):
- Includes all files by default (`**/*`)
- Excludes common build artifacts, dependencies, and IDE files
- Enables only `file-loader` and `binary` transformers by default
- Other transformers (PDF, image, markdown, etc.) must be explicitly enabled

**When to use custom profiles**:
- Focus on specific file types or directories
- Apply transformers to certain files
- Include files from external sources
- Override default exclusion rules

### Transformer Configuration

**Canonical Rule**: Transformers are configured **in profiles only**, not via CLI flags.

**There are NO `--transform` or `--no-transform` CLI flags**. Any documentation showing these flags is incorrect.

**How to enable transformers**:

```yaml
# In your profile file
transformers:
  pdf:
    enabled: true
    options:
      maxPages: 50

  image:
    enabled: true
    options:
      extractText: true
```

Then use the profile:
```bash
copytree --profile myprofile
```

**Code Reference**: `profiles/default.yml` lines 103-116, transformer configuration only in profile files

### Runtime Requirements

**Canonical Rule**: CopyTree requires Node.js 20.0 or higher and uses ES Modules (ESM) exclusively.

**Requirements**:
- **Node.js**: 20.0+ (defined in `package.json` engines field)
- **Module System**: ESM only (no CommonJS support)
- **npm**: 10.0+ (recommended, comes with Node.js 20+)

**Code Reference**: `package.json` lines 40-42

## Rationale

These decisions were made based on:

1. **Actual code behavior**: ProfileLoader and copy command implementation
2. **User experience**: Default profile enables "just works" experience
3. **Maintainability**: Clear precedence rules prevent configuration conflicts
4. **Performance**: Profile-based transformer config allows caching and optimization

## Consequences

### Documentation Updates Required

All documentation must reflect these canonical rules:

- ✅ **Profile selection**: Default profile is automatic, not optional
- ✅ **Transformer config**: Only in profiles, never via CLI
- ✅ **Node.js version**: Always state 20+ (not 18+)
- ✅ **ESM requirement**: Mention prominently in getting-started docs

### Files Updated (Initial Fix)

- `docs/usage/basic-usage.md` - Fixed profile and transformer contradictions
- `docs/index.md` - Updated to reflect automatic default profile
- `docs/installation/installation-guide.md` - Updated Node.js requirement to 20+
- `docs/usage/troubleshooting.md` - Updated Node.js version in examples
- `docs/technical/testing-strategy.md` - Updated test matrix to Node.js 20+

### Preventing Future Drift

1. **Single source of truth**: This DDR is the authoritative reference
2. **Link prominently**: Reference this DDR from:
   - `docs/profiles/profile-overview.md`
   - `docs/profiles/transformer-reference.md`
   - `docs/reference/configuration.md`
3. **CI validation**: Future CI should verify CLI examples match actual flags
4. **Review checklist**: Documentation PRs must check consistency with DDRs

## References

- Issue: [#41 - Comprehensive documentation overhaul needed](https://github.com/gregpriday/copytree/issues/41)
- Code files examined:
  - `src/profiles/ProfileLoader.js`
  - `src/commands/copy.js`
  - `profiles/default.yml`
  - `package.json`
