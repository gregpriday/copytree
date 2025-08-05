# Transformer Traits System

The transformer traits system provides advanced validation and optimization capabilities for transformer execution plans. This system helps prevent conflicts, optimize performance, and ensure proper resource allocation.

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
  inputTypes: ['text', 'binary'],     // What input types this transformer handles
  outputTypes: ['text'],              // What output types this transformer produces
  
  // Behavior Characteristics
  idempotent: true,                   // Can be run multiple times safely
  orderSensitive: false,              // Whether order matters for this transformer
  heavy: true,                        // CPU/memory intensive operation
  stateful: false,                    // Maintains state between runs
  
  // Dependencies and Conflicts
  dependencies: ['network', 'tesseract'], // External dependencies required
  conflictsWith: ['other-transformer'],   // Incompatible transformers
  
  // Resource Requirements
  requirements: {
    apiKey: true,                     // Requires API key
    network: true,                    // Requires network access
    memory: '100MB'                   // Memory requirements
  },
  
  // Categorization
  tags: ['ai', 'summary', 'expensive'] // Categories for grouping and warnings
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
registry.register('ai-summary', new AISummaryTransformer(), {
  extensions: ['.js', '.py'],
  priority: 20
}, {
  // Traits object
  inputTypes: ['text'],
  outputTypes: ['text'],
  idempotent: true,
  orderSensitive: false,
  heavy: true,
  requirements: {
    apiKey: true,
    network: true
  },
  tags: ['ai', 'summary', 'expensive']
});
```

### Default Transformer Traits

The system includes predefined traits for built-in transformers:

```javascript
// File Loader
{
  inputTypes: ['any'],
  outputTypes: ['text', 'binary'],
  idempotent: true,
  heavy: false,
  tags: ['loader', 'default']
}

// PDF Transformer
{
  inputTypes: ['binary'],
  outputTypes: ['text'],
  idempotent: true,
  heavy: true,
  requirements: { memory: '50MB' },
  tags: ['text-extraction', 'document', 'pdf']
}

// AI Summary
{
  inputTypes: ['text'],
  outputTypes: ['text'],
  idempotent: true,
  heavy: true,
  conflictsWith: ['file-summary'],
  requirements: {
    apiKey: true,
    network: true,
    memory: '200MB'
  },
  tags: ['ai', 'summary', 'expensive']
}
```

## Plan Validation

### Basic Validation

```javascript
const plan = ['pdf', 'ai-summary', 'markdown'];
const result = registry.validatePlan(plan);

console.log(result.valid);    // true/false
console.log(result.issues);   // Array of validation issues
console.log(result.warnings); // Array of optimization suggestions
```

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
const traits = registry.getTraits('ai-summary');
console.log(traits.heavy);        // true
console.log(traits.requirements); // { apiKey: true, network: true }

// List all transformers with traits
const transformers = registry.list();
transformers.forEach(t => {
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
  const transformerNames = context.stages.map(stage => stage.name);
  const validation = registry.validatePlan(transformerNames);
  
  if (!validation.valid) {
    context.logger.warn('Transformer plan has issues:', validation.issues);
  }
  
  if (validation.warnings.length > 0) {
    validation.warnings.forEach(warning => {
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
tags: ['ai', 'text-processing', 'summary', 'expensive']

// Avoid: Generic or meaningless tags
tags: ['misc', 'transformer']
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
validation.warnings.forEach(warning => {
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
    result.issues.forEach(issue => {
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
const validation = registry.validatePlan(['ai-summary']);
const resourceIssues = validation.issues.filter(issue => 
  issue.type === 'missing_resource'
);

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
  priority: 10
});

// New way with traits
registry.register('transformer', new Transformer(), {
  extensions: ['.txt'],
  priority: 10
}, {
  inputTypes: ['text'],
  outputTypes: ['text'],
  idempotent: true,
  heavy: false,
  tags: ['text-processing']
});
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

## See Also

- [TransformerRegistry API Reference](./transformer-registry-api.md)
- [Pipeline Architecture](./pipeline-architecture.md)
- [Custom Transformer Development](./custom-transformers.md)