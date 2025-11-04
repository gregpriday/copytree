import {
  SecretFilters,
  createFiltersFromConfig,
  validateAllowlist,
  validateDenylist,
} from '../../../src/utils/SecretFilters.js';

describe('SecretFilters', () => {
  describe('allowlist compilation', () => {
    it('should compile string rules', () => {
      const filters = new SecretFilters({
        allowlist: ['example.com'],
      });

      expect(filters.isAllowlisted('api.example.com')).toBe(true);
      expect(filters.isAllowlisted('example.com')).toBe(true);
      expect(filters.isAllowlisted('other.org')).toBe(false);
    });

    it('should compile regex rules', () => {
      const filters = new SecretFilters({
        allowlist: ['/test-.*-key/'],
      });

      expect(filters.isAllowlisted('test-dev-key')).toBe(true);
      expect(filters.isAllowlisted('test-prod-key')).toBe(true);
      expect(filters.isAllowlisted('prod-key')).toBe(false);
    });

    it('should compile glob rules', () => {
      const filters = new SecretFilters({
        allowlist: ['*.example.com'],
      });

      expect(filters.isAllowlisted('api.example.com')).toBe(true);
      expect(filters.isAllowlisted('dev.example.com')).toBe(true);
      expect(filters.isAllowlisted('example.org')).toBe(false);
    });

    it('should support structured rule objects', () => {
      const filters = new SecretFilters({
        allowlist: [
          { type: 'string', pattern: 'test', reason: 'Test values' },
          { type: 'regex', pattern: /dev-\d+/, reason: 'Dev tokens' },
          { type: 'glob', pattern: '*.local', reason: 'Local domains' },
        ],
      });

      expect(filters.isAllowlisted('test-value')).toBe(true);
      expect(filters.isAllowlisted('dev-123')).toBe(true);
      expect(filters.isAllowlisted('api.local')).toBe(true);
    });

    it('should handle multiple rules', () => {
      const filters = new SecretFilters({
        allowlist: ['example.com', '/test-.*/', '*.local'],
      });

      expect(filters.isAllowlisted('example.com')).toBe(true);
      expect(filters.isAllowlisted('test-abc')).toBe(true);
      expect(filters.isAllowlisted('api.local')).toBe(true);
      expect(filters.isAllowlisted('other')).toBe(false);
    });

    it('should be case-insensitive by default', () => {
      const filters = new SecretFilters({
        allowlist: ['EXAMPLE.COM'],
      });

      expect(filters.isAllowlisted('example.com')).toBe(true);
      expect(filters.isAllowlisted('EXAMPLE.COM')).toBe(true);
      expect(filters.isAllowlisted('Example.Com')).toBe(true);
    });

    it('should skip invalid rules gracefully', () => {
      // Mock console.warn to suppress warnings
      const originalWarn = console.warn;
      console.warn = jest.fn();

      const filters = new SecretFilters({
        allowlist: ['valid-rule', { type: 'regex', pattern: '[invalid' }],
      });

      expect(filters.isAllowlisted('valid-rule')).toBe(true);
      expect(console.warn).toHaveBeenCalled();

      console.warn = originalWarn;
    });

    it('should handle empty allowlist', () => {
      const filters = new SecretFilters({ allowlist: [] });

      expect(filters.isAllowlisted('anything')).toBe(false);
    });
  });

  describe('denylist compilation', () => {
    it('should compile custom patterns', () => {
      const filters = new SecretFilters({
        denylist: [
          {
            name: 'custom-token',
            pattern: 'CTK_[A-Z0-9]{16}',
            description: 'Custom token',
            severity: 'high',
          },
        ],
      });

      const patterns = filters.getDenylistPatterns();

      expect(patterns).toHaveLength(1);
      expect(patterns[0].name).toBe('custom-token');
      expect(patterns[0].pattern).toBeInstanceOf(RegExp);
      expect(patterns[0].severity).toBe('high');
      expect(patterns[0].source).toBe('denylist');
    });

    it('should add global flag if missing', () => {
      const filters = new SecretFilters({
        denylist: [
          {
            name: 'test-pattern',
            pattern: 'TEST_\\d+',
            description: 'Test pattern',
          },
        ],
      });

      const patterns = filters.getDenylistPatterns();
      expect(patterns[0].pattern.global).toBe(true);
    });

    it('should accept RegExp objects', () => {
      const filters = new SecretFilters({
        denylist: [
          {
            name: 'test-pattern',
            pattern: /TEST_\d+/g,
            description: 'Test pattern',
            severity: 'medium',
          },
        ],
      });

      const patterns = filters.getDenylistPatterns();
      expect(patterns).toHaveLength(1);
      expect(patterns[0].pattern).toBeInstanceOf(RegExp);
    });

    it('should apply default values for optional fields', () => {
      const filters = new SecretFilters({
        denylist: [
          {
            name: 'minimal-pattern',
            pattern: 'MINIMAL_\\w+',
          },
        ],
      });

      const patterns = filters.getDenylistPatterns();
      expect(patterns[0].description).toBe('Custom pattern: minimal-pattern');
      expect(patterns[0].severity).toBe('medium');
      expect(patterns[0].redactionLabel).toBe('MINIMAL-PATTERN');
    });

    it('should reject invalid patterns', () => {
      expect(() => {
        new SecretFilters({
          denylist: [
            {
              name: 'bad-pattern',
              pattern: '[invalid-regex', // Invalid regex
            },
          ],
        });
      }).toThrow();
    });

    it('should reject patterns without name', () => {
      expect(() => {
        new SecretFilters({
          denylist: [
            {
              pattern: 'VALID_\\w+',
            },
          ],
        });
      }).toThrow();
    });

    it('should handle empty denylist', () => {
      const filters = new SecretFilters({ denylist: [] });

      expect(filters.getDenylistPatterns()).toEqual([]);
    });
  });

  describe('isAllowlisted()', () => {
    it('should check match against rules', () => {
      const filters = new SecretFilters({
        allowlist: ['test-value', '/dev-\\d+/', '*.example.com'],
      });

      expect(filters.isAllowlisted('test-value')).toBe(true);
      expect(filters.isAllowlisted('dev-123')).toBe(true);
      expect(filters.isAllowlisted('api.example.com')).toBe(true);
      expect(filters.isAllowlisted('prod-key')).toBe(false);
    });

    it('should check file path with glob rules', () => {
      const filters = new SecretFilters({
        allowlist: ['test/**/*.js', '*.config.js'],
      });

      expect(filters.isAllowlisted('secret', 'test/unit/file.js')).toBe(true);
      expect(filters.isAllowlisted('secret', 'webpack.config.js')).toBe(true);
      expect(filters.isAllowlisted('secret', 'src/index.js')).toBe(false);
    });

    it('should return false for empty allowlist', () => {
      const filters = new SecretFilters({ allowlist: [] });

      expect(filters.isAllowlisted('anything')).toBe(false);
    });
  });

  describe('filterFindings()', () => {
    it('should filter allowlisted findings', () => {
      const filters = new SecretFilters({
        allowlist: ['example.com'],
      });

      const findings = [
        { match: 'key.example.com', file: 'test.js', type: 'secret' },
        { match: 'real-secret', file: 'test.js', type: 'secret' },
      ];

      const result = filters.filterFindings(findings);

      expect(result.filtered).toHaveLength(1);
      expect(result.filtered[0].match).toBe('real-secret');
      expect(result.suppressed).toHaveLength(1);
      expect(result.suppressed[0].match).toBe('key.example.com');
      expect(result.suppressed[0].suppressedReason).toBe('allowlist');
    });

    it('should filter by file path', () => {
      const filters = new SecretFilters({
        allowlist: ['test/**/*.js'],
      });

      const findings = [
        { match: 'secret1', file: 'test/unit/file.js', type: 'secret' },
        { match: 'secret2', file: 'src/index.js', type: 'secret' },
      ];

      const result = filters.filterFindings(findings);

      expect(result.filtered).toHaveLength(1);
      expect(result.filtered[0].file).toBe('src/index.js');
      expect(result.suppressed).toHaveLength(1);
      expect(result.suppressed[0].file).toBe('test/unit/file.js');
    });

    it('should return all findings if no allowlist', () => {
      const filters = new SecretFilters({ allowlist: [] });

      const findings = [
        { match: 'secret1', file: 'test.js', type: 'secret' },
        { match: 'secret2', file: 'test.js', type: 'secret' },
      ];

      const result = filters.filterFindings(findings);

      expect(result.filtered).toHaveLength(2);
      expect(result.suppressed).toHaveLength(0);
    });

    it('should handle empty findings array', () => {
      const filters = new SecretFilters({
        allowlist: ['example.com'],
      });

      const result = filters.filterFindings([]);

      expect(result.filtered).toEqual([]);
      expect(result.suppressed).toEqual([]);
    });
  });

  describe('getDenylistPatterns()', () => {
    it('should return compiled denylist patterns', () => {
      const filters = new SecretFilters({
        denylist: [
          {
            name: 'pattern1',
            pattern: 'P1_\\w+',
            description: 'Pattern 1',
            severity: 'high',
          },
          {
            name: 'pattern2',
            pattern: 'P2_\\w+',
            description: 'Pattern 2',
            severity: 'medium',
          },
        ],
      });

      const patterns = filters.getDenylistPatterns();

      expect(patterns).toHaveLength(2);
      expect(patterns[0].name).toBe('pattern1');
      expect(patterns[1].name).toBe('pattern2');
    });
  });

  describe('getStats()', () => {
    it('should return filter statistics', () => {
      const filters = new SecretFilters({
        allowlist: ['string-rule', '/regex-rule/', '*.glob-rule'],
        denylist: [
          { name: 'custom1', pattern: 'C1_\\w+' },
          { name: 'custom2', pattern: 'C2_\\w+' },
        ],
      });

      const stats = filters.getStats();

      expect(stats.allowlistRules).toBe(3);
      expect(stats.denylistPatterns).toBe(2);
      expect(stats.ruleTypes.string).toBeGreaterThan(0);
      expect(stats.ruleTypes.regex).toBeGreaterThan(0);
      expect(stats.ruleTypes.glob).toBeGreaterThan(0);
    });

    it('should handle empty filters', () => {
      const filters = new SecretFilters();
      const stats = filters.getStats();

      expect(stats.allowlistRules).toBe(0);
      expect(stats.denylistPatterns).toBe(0);
      expect(stats.ruleTypes.string).toBe(0);
      expect(stats.ruleTypes.regex).toBe(0);
      expect(stats.ruleTypes.glob).toBe(0);
    });
  });
});

describe('createFiltersFromConfig()', () => {
  it('should create filters from config object', () => {
    const config = {
      allowlist: ['example.com', '/test-.*/', '*.local'],
      customPatterns: [
        {
          name: 'custom-token',
          pattern: 'CTK_[A-Z0-9]{16}',
          description: 'Custom token',
          severity: 'high',
        },
      ],
    };

    const filters = createFiltersFromConfig(config);

    expect(filters.isAllowlisted('example.com')).toBe(true);
    expect(filters.getDenylistPatterns()).toHaveLength(1);
  });

  it('should work with empty config', () => {
    const filters = createFiltersFromConfig();

    expect(filters.isAllowlisted('anything')).toBe(false);
    expect(filters.getDenylistPatterns()).toEqual([]);
  });

  it('should work with partial config', () => {
    const filters = createFiltersFromConfig({ allowlist: ['test'] });

    expect(filters.isAllowlisted('test')).toBe(true);
    expect(filters.getDenylistPatterns()).toEqual([]);
  });
});

describe('validateAllowlist()', () => {
  it('should validate valid allowlist', () => {
    const allowlist = ['string-rule', '/regex-rule/', '*.glob-rule'];
    const result = validateAllowlist(allowlist);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should validate structured rules', () => {
    const allowlist = [
      { type: 'string', pattern: 'test' },
      { type: 'regex', pattern: 'test-.*' },
      { type: 'glob', pattern: '*.test' },
    ];
    const result = validateAllowlist(allowlist);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should reject non-array allowlist', () => {
    const result = validateAllowlist('not-an-array');

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Allowlist must be an array');
  });

  it('should reject rules missing pattern field', () => {
    const allowlist = [{ type: 'string' }];
    const result = validateAllowlist(allowlist);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("missing 'pattern' field");
  });

  it('should reject invalid rule types', () => {
    const allowlist = [{ type: 'invalid', pattern: 'test' }];
    const result = validateAllowlist(allowlist);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('invalid type');
  });

  it('should reject invalid regex patterns', () => {
    const allowlist = [{ type: 'regex', pattern: '[invalid-regex' }];
    const result = validateAllowlist(allowlist);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('invalid regex');
  });

  it('should reject non-string, non-object rules', () => {
    const allowlist = ['valid', 123, null];
    const result = validateAllowlist(allowlist);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('validateDenylist()', () => {
  it('should validate valid denylist', () => {
    const denylist = [
      {
        name: 'pattern1',
        pattern: 'P1_\\w+',
        description: 'Pattern 1',
        severity: 'high',
      },
      {
        name: 'pattern2',
        pattern: 'P2_\\w+',
        description: 'Pattern 2',
        severity: 'medium',
      },
    ];
    const result = validateDenylist(denylist);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should reject non-array denylist', () => {
    const result = validateDenylist('not-an-array');

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Denylist must be an array');
  });

  it('should reject non-object patterns', () => {
    const denylist = ['string-pattern', 123, null];
    const result = validateDenylist(denylist);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should reject patterns missing name field', () => {
    const denylist = [{ pattern: 'VALID_\\w+' }];
    const result = validateDenylist(denylist);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("missing 'name' field");
  });

  it('should reject patterns missing pattern field', () => {
    const denylist = [{ name: 'test' }];
    const result = validateDenylist(denylist);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("missing 'pattern' field");
  });

  it('should reject duplicate pattern names', () => {
    const denylist = [
      { name: 'duplicate', pattern: 'P1_\\w+' },
      { name: 'duplicate', pattern: 'P2_\\w+' },
    ];
    const result = validateDenylist(denylist);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes('duplicate name'))).toBe(true);
  });

  it('should reject invalid regex patterns', () => {
    const denylist = [{ name: 'bad', pattern: '[invalid-regex' }];
    const result = validateDenylist(denylist);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('invalid regex');
  });

  it('should reject invalid severity values', () => {
    const denylist = [{ name: 'test', pattern: 'TEST_\\w+', severity: 'invalid' }];
    const result = validateDenylist(denylist);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('invalid severity');
  });

  it('should accept valid severity values', () => {
    const denylist = [
      { name: 'low-test', pattern: 'L_\\w+', severity: 'low' },
      { name: 'med-test', pattern: 'M_\\w+', severity: 'medium' },
      { name: 'high-test', pattern: 'H_\\w+', severity: 'high' },
    ];
    const result = validateDenylist(denylist);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
