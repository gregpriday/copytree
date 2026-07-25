/**
 * The built-in scanner's false-positive behaviour is the property under test.
 *
 * Every case in "leaves real source alone" was reported from a real repository,
 * where the previous rules matched from the keyword onward and replaced a span
 * of working code with a redaction marker. The output of this tool is source
 * handed to a model; a scanner that corrupts it is worse than no scanner.
 */

import {
  scanContent,
  looksLikeSecret,
  shannonEntropy,
  isPlaceholderValue,
} from '../../../src/utils/secretPatterns.js';
import SecretRedactor from '../../../src/utils/SecretRedactor.js';

/**
 * Scan a line and return the matched credentials.
 * @param {string} line - Source line
 * @returns {string[]} Matched values
 */
const matches = (line) => scanContent(line, 'file.ts').map((f) => f.Match);

// A synthetic, never-issued Stripe-shaped credential used only to exercise
// the PROVIDER_TOKEN pattern. Assembled at runtime rather than written as one
// literal so the full string never appears contiguously in this file — a
// secret scanner (including GitHub push protection) matches on the raw file
// text, not the evaluated JS value.
const STRIPE_SECRET_KEY = ['sk', 'live', '4eC39HqLyjWDarjtT1zdp7dc'].join('_');
const STRIPE_PUBLISHABLE_KEY = ['pk', 'live', '4eC39HqLyjWDarjtT1zdp7dc'].join('_');

describe('secretPatterns', () => {
  describe('leaves real source alone', () => {
    it.each([
      ['a property read', 'const token = payload.token.trim();'],
      ['a function call', 'const token = extractBearerToken(authHeader);'],
      ['prose in a document', 'Token classification: high entropy detection'],
      ['an env reference', 'const password = process.env.DB_PASSWORD;'],
      ['an identifier containing the keyword', 'this.apiClient = new ApiClient(config);'],
      ['a C++ signature', 'AssignProcessToHelpJob(const NTOKEN_INFO info)'],
      ['an awaited call', 'const token = await getAccessToken(scope);'],
      ['a comment', '// TODO: rotate the api key before launch'],
      ['a hook call', 'const secret = useSecretStore((s) => s.secret);'],
      ['an HTML attribute', '<input name="password" type="password" />'],
      ['a template interpolation', 'token = "${process.env.TOKEN}"'],
      ['an angle-bracket placeholder', 'apiKey: "<YOUR_API_KEY_HERE>"'],
      ['a handlebars placeholder', 'token: "{{ACCESS_TOKEN}}"'],
      ['a quoted identifier path', 'password: "process.env.DB_PASS"'],
      ['a placeholder value', 'token: "your_token_here_placeholder"'],
      ['a repeated filler value', 'apiKey: "xxxxxxxxxxxxxxxxxxxx"'],
      ['a low-entropy value', 'const secret = "abcdefabcdefabcdef"'],
    ])('does not flag %s', (_label, line) => {
      expect(matches(line)).toEqual([]);
    });
  });

  describe('still finds real credentials', () => {
    it.each([
      ['a Stripe key', `api_key: "${STRIPE_SECRET_KEY}"`, STRIPE_SECRET_KEY],
      [
        'a provider token in a neutrally named variable',
        `const a = "${STRIPE_SECRET_KEY}";`,
        STRIPE_SECRET_KEY,
      ],
      [
        'a Slack token',
        'const hook = "xoxb-2401firstpart-2407secondpart";',
        'xoxb-2401firstpart-2407secondpart',
      ],
      [
        'a GitHub token',
        'const token = "ghp_16C7e42F292c6912E7710c838347Ae178B4a"',
        'ghp_16C7e42F292c6912E7710c838347Ae178B4a',
      ],
      [
        'a Google client secret',
        'client_secret: "GOCSPX-1a2B3c4D5e6F7g8H9i0JkLmNoPq"',
        'GOCSPX-1a2B3c4D5e6F7g8H9i0JkLmNoPq',
      ],
      ['a password with symbols', "password = 'Xk9#mQ2vLp8wRt4z'", 'Xk9#mQ2vLp8wRt4z'],
      [
        'a JWT',
        '  authToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      ],
      [
        'an environment assignment',
        'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYzRt9q2Lk',
        'wJalrXUtnFEMI/K7MDENG/bPxRfiCYzRt9q2Lk',
      ],
    ])('flags %s', (_label, line, expected) => {
      expect(matches(line)).toContain(expected);
    });

    it('flags an AWS access key id', () => {
      expect(matches('const id = "AKIAIOSFODNN7EXAMPLE";')).toContain('AKIAIOSFODNN7EXAMPLE');
    });

    it('flags a private key header', () => {
      expect(matches('-----BEGIN RSA PRIVATE KEY-----')).toContain(
        '-----BEGIN RSA PRIVATE KEY-----',
      );
    });
  });

  describe('reports the credential span, not the statement', () => {
    it('redacts only the value, leaving the code parseable', () => {
      const source = `const apiKey = "${STRIPE_SECRET_KEY}";`;
      const { content, count } = SecretRedactor.redact(
        source,
        scanContent(source, 'a.ts'),
        'typed',
      );

      expect(count).toBe(1);
      expect(content).toBe('const apiKey = "***REDACTED:PROVIDER_TOKEN***";');
      // The declaration survives: an agent reading this still sees the shape of
      // the code, which is the entire point of redacting rather than dropping.
      expect(content).toContain('const apiKey = ');
      expect(content).toContain(';');
    });

    it('leaves surrounding lines untouched', () => {
      const source = [
        'const token = payload.token.trim();',
        `const apiKey = "${STRIPE_SECRET_KEY}";`,
        'return extractBearerToken(authHeader);',
      ].join('\n');

      const { content } = SecretRedactor.redact(source, scanContent(source, 'a.ts'), 'typed');
      const lines = content.split('\n');

      expect(lines[0]).toBe('const token = payload.token.trim();');
      expect(lines[2]).toBe('return extractBearerToken(authHeader);');
      expect(lines[1]).toBe('const apiKey = "***REDACTED:PROVIDER_TOKEN***";');
    });

    it('redacts several credentials in one file', () => {
      const source = [
        `const a = "${STRIPE_SECRET_KEY}";`,
        'const plain = 1;',
        'password: "GOCSPX-1a2B3c4D5e6F7g8H9i0JkLmNoPq",',
      ].join('\n');

      const { content, count } = SecretRedactor.redact(
        source,
        scanContent(source, 'a.ts'),
        'typed',
      );

      expect(count).toBe(2);
      expect(content).toContain('const plain = 1;');
      expect(content).not.toContain(STRIPE_SECRET_KEY);
      expect(content).not.toContain('GOCSPX-1a2B3c4D5e6F7g8H9i0JkLmNoPq');
    });
  });

  describe('names as they are actually written', () => {
    // `_` is a word character, so a `\b`-anchored keyword never matched inside
    // `db_password` — which is how these are named in practice.
    it.each([
      ['db_password', 'db_password: "Xk9mQ2vLp8wRt4zQ1"'],
      ['stripe_api_key', 'stripe_api_key: "Xk9mQ2vLp8wRt4zQ1"'],
      ['service_client_secret', 'service_client_secret: "Xk9mQ2vLp8wRt4zQ1"'],
      ['camelCase', 'const myAuthToken = "Xk9mQ2vLp8wRt4zQ1";'],
      ['kebab-case in YAML', 'db-password: "Xk9mQ2vLp8wRt4zQ1"'],
    ])('flags a credential named %s', (_label, line) => {
      expect(matches(line)).toContain('Xk9mQ2vLp8wRt4zQ1');
    });

    it('still ignores an identifier that merely contains the keyword', () => {
      expect(matches('AssignProcessToHelpJob(const NTOKEN_INFO info)')).toEqual([]);
      expect(matches('const dbPasswordRef = props.dbPasswordRef;')).toEqual([]);
    });
  });

  describe('JSON Web Tokens', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';

    it('flags a full three-part JWT', () => {
      // Dot-separated word characters is also the shape of a reference path, so
      // the reference rejection used to discard these silently.
      expect(matches(`const authToken = "${jwt}";`)).toContain(jwt);
    });

    it('still ignores a genuine reference path', () => {
      expect(matches('password: "process.env.DB_PASS"')).toEqual([]);
      expect(matches('token: "this.props.authToken"')).toEqual([]);
    });
  });

  describe('private keys', () => {
    const pem = [
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIIEowIBAAKCAQEAxLxKvHx2Qv8j9mNq7d3sYtRw0pZbA1cE',
      'fLmNoPqRsTuVwXyZ0123456789abcdefghijklmnop==',
      '-----END RSA PRIVATE KEY-----',
    ].join('\n');

    it('covers the whole PEM block, not just the header', () => {
      // Matching the header alone redacted the label and emitted the key.
      const found = matches(pem);
      expect(found).toHaveLength(1);
      expect(found[0]).toContain('MIIEowIBAA');
      expect(found[0]).toContain('-----END RSA PRIVATE KEY-----');
    });

    it('redacts the body and leaves surrounding lines intact', () => {
      const source = `const key = \`\n${pem}\n\`;\n`;
      const { content } = SecretRedactor.redact(source, scanContent(source, 'a.ts'), 'typed');

      expect(content).not.toContain('MIIEowIBAA');
      expect(content).not.toContain('-----BEGIN');
      expect(content).toContain('const key = ');
      // The multi-line span must not eat the closing backtick and semicolon.
      expect(content.trimEnd().endsWith('`;')).toBe(true);
    });

    it('still reports a header with no footer', () => {
      expect(matches('-----BEGIN OPENSSH PRIVATE KEY-----\ntruncated')).toHaveLength(1);
    });
  });

  describe('public values are not secrets', () => {
    it('ignores a Stripe publishable key', () => {
      // `pk_live_*` is designed to ship in frontend code.
      expect(matches(`const pk = "${STRIPE_PUBLISHABLE_KEY}";`)).toEqual([]);
    });

    it('still flags the matching secret key', () => {
      expect(matches(`const sk = "${STRIPE_SECRET_KEY}";`)).toHaveLength(1);
    });
  });

  describe('stays linear on pathological input', () => {
    it('does not backtrack on a long uppercase line with no assignment', () => {
      const timings = [2000, 8000].map((n) => {
        const started = process.hrtime.bigint();
        scanContent('TOKEN'.repeat(n), 'a.ts');
        return Number(process.hrtime.bigint() - started) / 1e6;
      });

      // Quadratic backtracking showed ~16x for this 4x input growth.
      expect(timings[1]).toBeLessThan(Math.max(timings[0], 1) * 12);
      expect(timings[1]).toBeLessThan(500);
    });

    it('handles many findings in one file without quadratic overlap checks', () => {
      const started = process.hrtime.bigint();
      const found = scanContent(`apiKey: "${STRIPE_SECRET_KEY}"\n`.repeat(4000), 'a.ts');
      const ms = Number(process.hrtime.bigint() - started) / 1e6;

      expect(found).toHaveLength(4000);
      expect(ms).toBeLessThan(2000);
    });
  });

  describe('heuristics', () => {
    it('measures entropy in bits per character', () => {
      expect(shannonEntropy('')).toBe(0);
      expect(shannonEntropy('aaaa')).toBe(0);
      expect(shannonEntropy('abcd')).toBe(2);
    });

    it('treats a value built only of placeholder words as a placeholder', () => {
      expect(isPlaceholderValue('your_api_key_here')).toBe(true);
      expect(isPlaceholderValue('CHANGEME')).toBe(true);
      // One unknown segment is enough to make it a candidate again, so a real
      // credential containing "key" or "test" is not silently skipped.
      expect(isPlaceholderValue(STRIPE_SECRET_KEY)).toBe(false);
    });

    it('applies the entropy floor only when one is given', () => {
      expect(looksLikeSecret('aaaaaaaaaaaaaaaa', 3)).toBe(false);
      expect(looksLikeSecret('aaaaaaaaaaaaaaaa')).toBe(true);
    });
  });

  it('terminates on content with no matches', () => {
    expect(scanContent('', 'a.ts')).toEqual([]);
    expect(scanContent('const x = 1;\n'.repeat(500), 'a.ts')).toEqual([]);
  });
});
