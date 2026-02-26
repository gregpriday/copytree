# Generate Profile Command

Create a custom CopyTree profile for this repository:

1. Read `@docs/getting-started/first-profile.md` and `@README.md`
2. Analyze the current directory structure
3. Propose a `.copytree/<name>.yml` profile with:
   - Appropriate `include`/`exclude` patterns for this project type
   - Sensible file/size limits (default: 10MB per file, 100MB total)
   - Streaming enabled for large files
4. Validate the profile structure against the schema
5. Ask for confirmation before creating the file

Include rationale for each configuration choice.
