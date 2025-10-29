# Transformers Module Rules

## Transformer Contract

**MUST implement:**
- Extend `BaseTransformer` from `@src/transforms/BaseTransformer.js`
- Define `this.name` (kebab-case identifier)
- Define `this.traits` object with:
  - `inputTypes: string[]` - Input content types (e.g., `['text', 'binary']`)
  - `outputTypes: string[]` - Output content types
  - `idempotent: boolean` - Can safely reapply?
  - `heavy: boolean` - Resource-intensive (PDF, Image, AI)?
  - `dependencies?: string[]` - Required external tools (e.g., `['pandoc']`)
- Implement `async transform(file)` - Returns `{ ...file, content: transformed }`

## Traits System Rules

**Input/Output Types:**
- `text` - Plain text content
- `binary` - Binary data
- `structured` - JSON/YAML/XML data
- `markdown` - Markdown formatted text
- `html` - HTML content

**Idempotent transformers:**
- Can be applied multiple times safely
- Examples: markdown stripping, CSV formatting
- Must produce same output given same input

**Heavy transformers:**
- Marked `heavy: true` if CPU/memory intensive or uses external APIs
- Examples: PDF extraction, AI summarization, OCR
- Registry schedules these last, respects performance budgets

## Registration Rules

1. Import in `@src/transforms/TransformerRegistry.js`
2. Add to `createDefault()` method
3. Set priority (lower = earlier): filters < loaders < converters < AI
4. Declare conflicts if incompatible with other transformers

## Testing Requirements

- Add unit tests in `@tests/unit/transformers/`
- Test with various input types
- Mock external APIs (AI, OCR)
- Verify traits are enforced
- Test error handling and fallbacks

## Documentation

- Add entry to `@docs/profiles/transformer-reference.md`
- Include: name, purpose, options, example usage
- Document any external dependencies
