---
description: Create a Git worktree for parallel development with full setup
argument-hint: <task-description>
allowed-tools:
  - Bash(pwd:*)
  - Bash(basename:*)
  - Bash(git worktree:*)
  - Bash(git branch:*)
  - Bash(git rev-parse:*)
  - Bash(cd:*)
  - Bash(npm install:*)
  - Bash(composer install:*)
  - Bash(ls:*)
  - Bash(test:*)
---

# Create Git Worktree

You are creating a new Git worktree for parallel development with automatic setup and intelligent naming.

## Task Description

$ARGUMENTS

## Instructions for Claude

### Step 1: Gather Context

First, gather information about the current environment:

- Current directory: !`pwd`
- Repository root: !`git rev-parse --show-toplevel`
- Current branch: !`git branch --show-current`
- Project name: !`basename $(git rev-parse --show-toplevel)`

### Step 2: Determine Branch Name

Based on the task description, determine an appropriate branch name following Git Flow conventions:

**Branch Naming Conventions:**
- `feature/<description>` - New features (from `develop`)
- `bugfix/<description>` - Bug fixes (from `develop`)
- `hotfix/<description>` - Critical production fixes (from `main`, merge to both)
- `release/<version>` - Release preparation (from `develop`, merge to both)
- `chore/<description>` - Maintenance tasks
- `test/<description>` - Test improvements
- `docs/<description>` - Documentation updates
- `refactor/<description>` - Code refactoring
- `perf/<description>` - Performance improvements

**Best Practices:**
- Use lowercase with hyphens (kebab-case)
- Keep it concise but descriptive (2-4 words)
- Avoid special characters except hyphens
- Include issue/ticket number if relevant (e.g., `feature/COPY-123-add-pdf-support`)

**Examples of Good Branch Names:**
- `feature/streaming-output` (new feature)
- `bugfix/fix-markdown-escaping` (bug fix)
- `hotfix/critical-memory-leak` (production emergency)
- `chore/update-dependencies` (maintenance)
- `test/add-integration-tests` (testing)
- `docs/improve-transformer-guide` (documentation)
- `refactor/simplify-pipeline-stages` (refactoring)

**Examples of Poor Branch Names:**
- `fix` (too vague)
- `john_new_feature` (includes username, uses underscores)
- `FEATURE/ADD_STUFF` (uppercase, vague)
- `temporary` (unclear purpose)
- `test123` (meaningless)

### Step 3: Create Worktree

You should:
1. Determine the appropriate base branch (`develop` for most cases, `main` for hotfixes)
2. Generate the worktree directory name: `../<project-name>-<task-name>`
3. Create the worktree with: `git worktree add -b <branch-name> <worktree-path> <base-branch>`
4. Confirm the worktree was created successfully

### Step 4: Setup Environment

Detect the project type and set up dependencies in the new worktree:

**For Node.js/npm projects** (check for `package.json`):
- Run `npm install` in the worktree directory
- Verify installation completed successfully

**For PHP/Composer projects** (check for `composer.json`):
- Run `composer install` in the worktree directory
- Verify installation completed successfully

**For other project types**:
- Check for other dependency files (`Gemfile`, `requirements.txt`, `go.mod`, etc.)
- Run appropriate install commands if found
- If no dependency files found, skip this step

**Important**: Always `cd` into the worktree directory before running install commands.

### Step 5: Give User Final Instructions

Once setup is complete, provide the user with a summary using PLAIN TEXT formatting (not markdown headers) with proper line breaks between each item:

**Format your response exactly like this:**

```
Worktree created successfully!

Branch name: <branch-name>
Worktree path: <full-path>
Base branch: <base-branch>

Switch to the new worktree:
  cd ../<project-name>-<task-name> && cl!

When you're done, clean up with:
  git worktree remove ../<project-name>-<task-name>
  git branch -d <branch-name>
```

**Important formatting rules:**
- Use blank lines between sections for readability
- Indent commands with 2 spaces
- Do NOT use markdown headers (##, ###) in the final output
- Keep it concise and easy to copy-paste
