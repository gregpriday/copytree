export default {
  // Log level: error|warn|info|debug (default: info)
  level: 'info',

  // Log format: text|json|silent
  // - text: human-readable with colors
  // - json: NDJSON for log aggregation (CloudWatch, Splunk, ELK)
  // - silent: suppress all logs (errors still written to stderr)
  format: 'text',

  // Color mode: auto|always|never
  // - auto: enable colors when writing to a TTY (default)
  // - always: always use colors (even when piped)
  // - never: never use colors
  colorize: 'auto',

  // Include ISO timestamp in JSON log entries
  timestamp: true,

  // Log destination: stderr|stdout
  // Standard Unix practice: logs to stderr, program output to stdout
  destination: 'stderr',
};
