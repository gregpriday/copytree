# Release Command

Automates the complete GitFlow release process for CopyTree.

## Usage

```bash
/release [version]
```

- `version` (optional): The release version (e.g., 0.12.0). If not provided, Claude will analyze the changes and recommend a version.

## Examples

```bash
/release 0.12.0           # Create release with specific version
/release                  # Let Claude determine the version
```

## What this command does

1. **Version Analysis**: If no version is provided, analyzes changes between develop and main to recommend appropriate version (patch/minor/major)
2. **Release Branch Creation**: Creates `release/{version}` branch from develop
3. **Version Updates**: Updates package.json version and creates comprehensive changelog entry
4. **Commit Changes**: Uses `/commit` command for proper commit message formatting
5. **GitFlow Merge Process**: 
   - Merges release branch into main
   - Creates annotated git tag
   - Merges release branch back into develop
6. **Remote Sync**: Pushes all branches and tags to origin
7. **Cleanup**: Removes local release branch

## Prerequisites

- Must be on develop branch with clean working directory
- All changes should be committed and pushed to develop
- Git remote 'origin' must be configured

## Command Implementation

Execute the GitFlow release process:

1. Analyze changes between develop and main branches to determine appropriate version (if not provided)
2. Create release branch: `git checkout -b release/$ARGUMENTS develop`
3. Update package.json version to $ARGUMENTS
4. Create comprehensive changelog entry with today's date
5. Use `/commit` to commit version and changelog changes
6. Merge release branch into main with proper merge commit
7. Create annotated tag: `git tag -a v$ARGUMENTS`
8. Merge release branch back into develop
9. Push main, develop, and tags to origin
10. Delete local release branch

The command should handle both cases:
- With version argument: Use provided version directly
- Without version argument: Analyze git log and changes to recommend version based on semantic versioning rules and ALWAYS confirm with the user before making key decisions like the version number

Ensure all steps follow GitFlow conventions and include proper error handling for each step.