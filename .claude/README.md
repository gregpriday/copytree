# Claude Code Configuration

This directory contains configuration files and commands for Claude Code to work effectively with the CopyTree project.

## Structure

```
.claude/
├── README.md           # This file
└── commands/           # Slash commands for common workflows
    ├── review.md       # Pre-submission checks
    ├── gen-profile.md  # Generate CopyTree profile
    └── fix-tests.md    # Diagnose and fix test failures
```

## CLAUDE.md Structure

The project uses a **hierarchical CLAUDE.md system**:

- **`/CLAUDE.md`** (~148 lines) - Main constitution with critical rules, commands, and paved paths
- **`/src/pipeline/CLAUDE.md`** (48 lines) - Pipeline stage contracts and event rules
- **`/src/transforms/CLAUDE.md`** (55 lines) - Transformer trait requirements
- **`/tests/CLAUDE.md`** (74 lines) - Testing patterns and coverage requirements

**Current Limitation**: Due to [Claude Code bug #2571](https://github.com/anthropics/claude-code/issues/2571), subdirectory CLAUDE.md files don't auto-load yet. The root file instructs Claude to manually read them when working in those areas. Once the bug is fixed, they'll load automatically.

## Why This Structure?

Following best practices from the Claude Code guide:

1. **Token Efficiency**: Main `CLAUDE.md` is concise (~148 lines vs. previous 786 lines), reducing token burn on every prompt
2. **Future-Ready**: Structure anticipates bug fix while working around current limitations
3. **Constitution vs Documentation**: `CLAUDE.md` files contain rules/constraints; detailed docs live in `@docs/`
4. **Paved Paths**: Canonical workflows prevent Claude from inventing incorrect patterns
5. **Prompting Patterns**: Explicit "Review @CLAUDE.md" instructions improve adherence

## Using Slash Commands

Invoke commands in Claude Code conversations:

- `/review` - Run comprehensive pre-submission checks
- `/gen-profile` - Generate a CopyTree profile for this repo
- `/fix-tests` - Diagnose and fix test failures

## Prompting Best Practices

Start sessions with:
- "Review `@CLAUDE.md` before proceeding."
- "Follow the paved path for [task] and confirm each step."
- "Run through the Review Checklist before finishing."

## Maintenance

When updating rules:
1. Keep main `CLAUDE.md` under 150 lines
2. Move detailed explanations to `@docs/`
3. Update module-specific `CLAUDE.md` files as needed
4. When [bug #2571](https://github.com/anthropics/claude-code/issues/2571) is fixed, remove the "Module-Specific Context" workaround section from root CLAUDE.md
