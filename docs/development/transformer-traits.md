# Transformer Traits System

> **Experimental.** This lives behind `copytree/experimental`, and a minor
> release may change it. Read what follows as advisory lint rather than as a
> guarantee: the registry reports what a plan declares about itself, and cannot
> verify most of it.

Transformer traits are metadata describing what a transformer needs and what it
does to its input. The registry uses them to spot conflicts between transformers
in one plan, to suggest an execution order, and to report the external resources
a plan says it will need.

**What it does not do.** It does not check that those resources exist. Whether
an API key is configured is a question about a transformer's own configuration,
which only that transformer can answer; whether the network is reachable is not
answerable in advance at all. Both used to be reported as errors — one
unconditionally, without looking, and the other from an empty code block — so
`validatePlan` could fail a correctly configured plan and pass a broken one.
Declared requirements are now reported at `info`, and the transformer raises the
real error at the point it needs the thing and finds it missing.

Nor is the ordering advice dependency-aware beyond the declared graph: it moves
heavy transformers later, which is a heuristic, not a proof that the result is
equivalent.

## Overview

Transformer traits are metadata that describe the characteristics and requirements of transformers. The system uses these traits to:

- **Validate transformer sequences** for conflicts and compatibility
- **Optimize execution order** for better performance
- **Check resource requirements** before execution
- **Provide warnings** for potential issues

## Trait Structure

### Core Traits

```javascript
const traits = {
  // Input/Output Types
  inputTypes: ['text', 'binary'], // What input types this transformer handles
  outputTypes: ['text'], // What output types this transformer produces

  // Behavior Characteristics
  idempotent: true, // Can be run multiple times safely
  orderSensitive: false, // Whether order matters for this transformer
  heavy: true, // CPU/memory intensive operation
  stateful: false, // Maintains state between runs

  // Dependencies and Conflicts
  dependencies: ['network'], // External dependencies required
  conflictsWith: ['other-transformer'], // Incompatible transformers

  // Resource Requirements
  requirements: {
    apiKey: true, // Requires API key
    network: true, // Requires network access
    memory: '100MB', // Memory requirements
  },

  // Categorization
  tags: ['ai', 'summary', 'expensive'], // Categories for grouping and warnings
};
```

### Input/Output Types

Defines data type compatibility:

- `text` - Plain text content
- `binary` - Binary data (images, PDFs, etc.)
- `any` - Accepts any input type (universal compatibility)

### Behavior Characteristics

- **idempotent**: Running multiple times produces same result
- **orderSensitive**: Position in pipeline affects outcome
- **heavy**: Resource-intensive operation (AI, image processing)
- **stateful**: Maintains internal state between operations

## Registering Transformers with Traits

### Basic Registration

```javascript
import TransformerRegistry from './TransformerRegistry.js';

const registry = new TransformerRegistry();

// Register transformer with traits
registry.register(
  'my-converter',
  new MyConverter(),
  {
    extensions: ['.rst'],
    priority: 20,
  },
  {
    // Traits object
    inputTypes: ['any'],
    outputTypes: ['binary'],
    idempotent: true,
    orderSensitive: false,
    heavy: false,
    requirements: {
      memory: '100MB',
    },
    tags: ['binary'],
  },
);
```

### There are no built-in transformers

`TransformerRegistry.createDefault()` registers nothing, and that is the honest
state of this subsystem: CopyTree ships no content-to-content transformer.

It used to register three. `file-loader` and `streaming-file-loader` reloaded
content `FileLoadingStage` had already read, so with content always present they
returned their input untouched; `binary` was registered for `.doc`, `.zip`,
`.exe` and their kin, and returns `null` for any file that is not an image — so
it was registered for exactly the extensions on which it does nothing. Reading,
binary classification and binary policy belong to `FileLoadingStage`.

The registry is therefore an extension point rather than a shipped feature.
Register your own, and it runs.

## Plan Validation

### Basic Validation

```javascript
const plan = ['pdf', 'first-lines', 'markdown'];
const result = registry.validatePlan(plan);

console.log(result.valid); // false only when an `error`-severity issue was found
console.log(result.issues); // Conflicts, ordering notes, declared requirements
console.log(result.warnings); // Optimization suggestions
```

`valid` reflects errors alone. Advisory entries — a declared resource
requirement, an ordering note — appear in `issues` at `info`, and used to make a
plan invalid for telling you something useful about it.

### Validation Result Structure

```javascript
{
  valid: boolean,
  issues: [
    {
      type: 'conflict',
      severity: 'error',
      message: 'Transformer A conflicts with Transformer B',
      transformers: ['transformer-a', 'transformer-b']
    }
  ],
  warnings: [
    {
      type: 'performance',
      severity: 'warning',
      message: 'Multiple heavy transformers may impact performance',
      suggestion: 'Consider reducing AI operations'
    }
  ]
}
```

### Issue Types

- **conflict**: Explicit transformer conflicts
- **incompatible_types**: Input/output type mismatches
- **ordering**: Suboptimal transformer ordering
- **missing_resource**: Required resources not available
- **performance**: Performance concerns
- **redundancy**: Duplicate functionality detected

## Plan Optimization

### Automatic Optimization

```javascript
const suboptimalPlan = ['heavy-ai', 'order-sensitive', 'light-text'];
const optimization = registry.optimizePlan(suboptimalPlan);

console.log('Original:', suboptimalPlan.join(' → '));
console.log('Optimized:', optimization.optimized.join(' → '));
console.log('Changes:', optimization.changes.length);
```

### Optimization Rules

1. **Order-sensitive transformers** positioned appropriately
2. **Heavy operations** moved to end of pipeline
3. **Light operations** processed first when possible
4. **Dependencies** resolved in correct order

### Optimization Result

```javascript
{
  optimized: ['order-sensitive', 'light-text', 'heavy-ai'],
  changes: [
    { from: 1, to: 0, transformer: 'order-sensitive' },
    { from: 0, to: 2, transformer: 'heavy-ai' }
  ],
  reasoning: [
    'Reordered transformers for optimal execution:',
    '- Order-sensitive transformers moved to appropriate positions',
    '- Heavy operations moved to end to minimize impact'
  ]
}
```

## Advanced Usage

### Custom Trait Validation

```javascript
// Disable validation for specific cases
registry.setValidationEnabled(false);
const result = registry.validatePlan(conflictingPlan); // Always valid

// Re-enable validation
registry.setValidationEnabled(true);
```

### Accessing Transformer Traits

```javascript
// Get traits for specific transformer
const traits = registry.getTraits('pdf');
console.log(traits.heavy); // true
console.log(traits.requirements); // { memory: '100MB' }

// List all transformers with traits
const transformers = registry.list();
transformers.forEach((t) => {
  if (t.traits) {
    console.log(`${t.name}: ${t.traits.tags.join(', ')}`);
  }
});
```

### Integration with Pipeline

```javascript
import Pipeline from './Pipeline.js';

// Pipeline can use validation during construction
const pipeline = new Pipeline(config);
pipeline.addStage('validation', async (context) => {
  const transformerNames = context.stages.map((stage) => stage.name);
  const validation = registry.validatePlan(transformerNames);

  if (!validation.valid) {
    context.logger.warn('Transformer plan has issues:', validation.issues);
  }

  if (validation.warnings.length > 0) {
    validation.warnings.forEach((warning) => {
      context.logger.warn(`${warning.type}: ${warning.message}`);
    });
  }
});
```

## Best Practices

### 1. Define Comprehensive Traits

```javascript
// Good: Complete trait definition
{
  inputTypes: ['text'],
  outputTypes: ['text'],
  idempotent: true,
  orderSensitive: false,
  heavy: false,
  dependencies: [],
  conflictsWith: [],
  requirements: {},
  tags: ['text-processing', 'formatting']
}

// Avoid: Minimal traits (system will use defaults)
{
  heavy: true
}
```

### 2. Use Meaningful Tags

```javascript
// Good: Descriptive, hierarchical tags
tags: ['ai', 'text-processing', 'summary', 'expensive'];

// Avoid: Generic or meaningless tags
tags: ['misc', 'transformer'];
```

### 3. Specify Explicit Conflicts

```javascript
// Good: Clear conflict specification
{
  conflictsWith: ['file-summary', 'quick-summary'],
  tags: ['ai', 'summary']
}
```

### 4. Validate Before Execution

```javascript
// Always validate plans in production
const validation = registry.validatePlan(transformerPlan);
if (!validation.valid) {
  throw new Error(`Invalid transformer plan: ${validation.issues[0].message}`);
}

// Log warnings for optimization opportunities
validation.warnings.forEach((warning) => {
  logger.warn(warning.message);
});
```

### 5. Handle Missing Traits Gracefully

```javascript
// System handles transformers without traits
const traits = registry.getTraits('unknown-transformer');
if (traits) {
  // Use trait information
  if (traits.heavy) {
    logger.info('Heavy transformer detected');
  }
} else {
  // Fallback behavior
  logger.debug('No traits available for transformer');
}
```

## Error Handling

### Validation Errors

```javascript
try {
  const result = registry.validatePlan(plan);
  if (!result.valid) {
    result.issues.forEach((issue) => {
      switch (issue.severity) {
        case 'error':
          logger.error(`Validation error: ${issue.message}`);
          break;
        case 'warning':
          logger.warn(`Validation warning: ${issue.message}`);
          break;
        case 'info':
          logger.info(`Validation info: ${issue.message}`);
          break;
      }
    });
  }
} catch (error) {
  logger.error('Validation failed:', error.message);
}
```

### Resource Validation

```javascript
// Check for missing resources before execution
const validation = registry.validatePlan(['pdf']);
const resourceIssues = validation.issues.filter((issue) => issue.type === 'missing_resource');

if (resourceIssues.length > 0) {
  throw new Error(`Missing required resources: ${resourceIssues[0].message}`);
}
```

## Migration Guide

### From Existing Code

If you have existing transformer registrations:

```javascript
// Old way (still works)
registry.register('transformer', new Transformer(), {
  extensions: ['.txt'],
  priority: 10,
});

// New way with traits
registry.register(
  'transformer',
  new Transformer(),
  {
    extensions: ['.txt'],
    priority: 10,
  },
  {
    inputTypes: ['text'],
    outputTypes: ['text'],
    idempotent: true,
    heavy: false,
    tags: ['text-processing'],
  },
);
```

### Backward Compatibility

- Transformers without traits continue to work
- Validation is skipped for transformers without traits
- System uses sensible defaults where possible
- No breaking changes to existing APIs

## Performance Considerations

### Validation Overhead

- Validation is lightweight for small plans
- Consider disabling for high-frequency operations
- Cache validation results when possible

### Memory Usage

- Traits are stored in memory per transformer
- Minimal memory overhead for trait storage
- No impact on transformer execution performance

## Future Enhancements

The traits system is designed for extensibility:

- **Dynamic trait discovery** from transformer instances
- **Machine learning-based optimization** suggestions
- **Runtime performance monitoring** integration
- **Custom validation rules** for specific use cases

## Related Documentation

- [Architecture Guide](../technical/architecture.md) - Pipeline and system design
