# Pipeline Module Rules

## Stage Contract Requirements

**MUST implement:**
- `async process(input)` - Main processing logic
- Return `{ ...input, files: processedFiles }` shape

**SHOULD implement:**
- `async onInit(context)` - One-time initialization
- `async beforeRun(input)` - Pre-processing hook
- `async afterRun(output)` - Post-processing hook
- `async handleError(error, input)` - Error recovery (return valid output to continue pipeline)
- `validate(input)` - Input validation

## Event Emission Rules

**MUST emit** (via base class helpers):
- Use `this.emitProgress(percent, message, { completed, total, item })` for progress
  updates — pass concrete counts whenever the stage knows its denominator, since
  that is what the CLI renders
- Use `this.emitFileEvent(filePath, action)` for file operations (auto-throttled)
- Use `this.log(message, level)` for stage logging

**MUST NOT** write to `process.stdout` or `process.stderr`, move the cursor,
clear lines, or drive a spinner. The terminal belongs to the run reporter; a
stage that draws its own output collides with it, corrupts `--display` and
`--stream`, and ignores `--no-color`, `--quiet` and the log level.

Log a fatal stage's own failure at `debug`, not `error`: the error is rethrown
and reported once, with a remediation, by the reporter.

**Event contract** (Pipeline emits automatically):
- `stage:start` - When stage begins
- `stage:complete` - When stage finishes (includes duration, memory, I/O metrics)
- `stage:error` - When stage fails
- `stage:recover` - When handleError() succeeds

## Performance Rules

- Stream files >10MB (use `StreamingFileLoader` transformer)
- Process files in batches to keep transient allocation down
- Emit progress every 10% or 100 files
- Monitor memory deltas in `afterRun()`

## Error Handling

- Use custom errors from `@src/utils/errors.js`
- Implement `handleError()` for graceful degradation
- Return partial results when possible (don't fail entire pipeline)
- Log errors via `this.log(error.message, 'error')`
