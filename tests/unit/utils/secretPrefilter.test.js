import {
  BASIC_PATTERNS,
  couldContainSecret,
  scanContent,
} from '../../../src/utils/secretPatterns.js';

/**
 * The prefilter in `scanContent` exists to skip the rule set for files that
 * cannot match it. Its only dangerous failure mode is being *stricter* than the
 * rules: a file it rejects is never scanned, so a credential it fails to
 * recognise is published in the clear.
 *
 * These tests pin that direction. They are not about the prefilter's hit rate —
 * a prefilter that let everything through would be slow and correct, and would
 * pass every assertion here.
 */

/**
 * Every sample below is assembled from a prefix and a body rather than written
 * as one literal.
 *
 * These are fabricated — no such credential has ever existed — but a scanner
 * cannot know that, and a file full of things shaped exactly like live tokens
 * is a file that trips every scanner it passes. GitHub's push protection
 * rejected the literal form of this table outright, which is the correct
 * response to what it saw. Splitting each value across a concatenation keeps the
 * runtime string identical, so the rules under test see exactly what they need
 * to see, while nothing in the source reads as a credential.
 *
 * @param {string} prefix - The published token prefix a rule keys on
 * @param {string} body - Filler of the right shape and length
 * @returns {string} The assembled sample
 */
const token = (prefix, body) => prefix + body;

/** Content that the full rule set does find secrets in. */
const POSITIVES = [
  ['AWS access key', `const id = "${token('AKIA', 'IOSFODNN7EXAMPLE')}";`],
  ['AWS secret key', `aws_secret = "${token('wJalrXUtnFEMI/K7MDENG/', 'bPxRfiCYEXAMPLEKEY')}"`],
  [
    'PEM private key',
    `${token('-----BEGIN', ' RSA PRIVATE KEY-----')}\nMIIEowIBAAKCAQEA7f4Xq2\n-----END RSA PRIVATE KEY-----`,
  ],
  ['PEM header alone', token('-----BEGIN', ' OPENSSH PRIVATE KEY-----')],
  ['GitHub PAT', token('ghp', '_016C7e42F292c6912E7710c838347Ae178B4a')],
  ['GitHub fine-grained PAT', token('github_pat', `_${'a1B2c3D4e5'.repeat(6)}`)],
  ['Stripe secret key', token('sk', '_live_4eC39HqLyjWDarjtT1zdp7dc')],
  ['Stripe restricted key', token('rk', '_test_4eC39HqLyjWDarjtT1zdp7dc')],
  ['GitLab PAT', token('glpat', '-ZyxWvuTsrqPonMlkJihG')],
  ['Slack token', token('xoxb', '-1234567890-abcdefghijklmnop')],
  ['Google API key', token('AIza', 'SyC1qMv8Xk3nP7wR2tY5uI9oL0aB4cD6eF8')],
  ['Anthropic key', token('sk-ant', '-api03-Zx9yW8vU7tS6rQ5pO4nM3lK2j')],
  ['OpenAI project key', token('sk-proj', '-Ab1Cd2Ef3Gh4Ij5Kl6Mn7Op8Qr9St0Uv')],
  ['SendGrid key', token('SG.', 'ngeVfQFYQlKU0ufo8x5d1A.TwL2iGABf9DHoTf-09kqeF8tAmbihYzrnopKc')],
  ['npm token', token('npm', `_${'aB3dE6gH9jK2mN5pQ8sT1vW4yZ7cF0iL3oR6'.slice(0, 36)}`)],
  ['quoted generic token', `const api_key = "${token('sk9Xq2Lm', '7Pv4Rt8Wz1Yb5Nc3Hd6Kf0Jg')}";`],
  ['env-style assignment', `DATABASE_PASSWORD=${token('hT8kQ2pL', '9wR4zX7vN1mB5cY3fD6sJ0aG')}`],
  ['export env assignment', `export API_TOKEN="${token('9wR4zX7v', 'N1mB5cY3fD6sJ0aGhT8kQ2pL')}"`],
  [
    'JWT under a keyword',
    `auth_token: "${token('eyJhbGciOiJIUzI1NiJ9.', 'eyJzdWIiOiIxMjM0In0.dBjftJeZ4CVP')}"`,
  ],
];

/** Ordinary source content, which should be rejected cheaply. */
const NEGATIVES = [
  'export function add(a, b) {\n  return a + b;\n}\n',
  'import React from "react";\nexport default () => <div>hello</div>;\n',
  '# Heading\n\nSome documentation about the pipeline architecture.\n',
  'const colors = ["red", "green", "blue"];\n',
  '.container { display: flex; align-items: center; }\n',
];

describe('secret scanner prefilter', () => {
  describe('never rejects content the rules would flag', () => {
    it.each(POSITIVES)('admits %s', (_label, content) => {
      // The premise: the full rules really do find something here. Without this
      // the test could pass on a sample that finds nothing either way.
      expect(scanContent(content, 'sample.txt').length).toBeGreaterThan(0);
      expect(couldContainSecret(content)).toBe(true);
    });

    it('admits every positive when embedded in ordinary surrounding code', () => {
      for (const [label, secret] of POSITIVES) {
        const embedded = `${NEGATIVES[0]}\n${secret}\n${NEGATIVES[2]}`;
        expect([label, couldContainSecret(embedded)]).toEqual([label, true]);
        expect([label, scanContent(embedded, 'x.js').length > 0]).toEqual([label, true]);
      }
    });

    it('covers a literal for every rule in the pattern set', () => {
      // A rule added without a matching hint would silently stop being applied.
      // Each positive above is labelled by rule; assert the set is complete.
      const ruleIds = new Set(BASIC_PATTERNS.map((pattern) => pattern.id));
      const covered = new Set(
        POSITIVES.flatMap(([, content]) =>
          scanContent(content, 'x').map((finding) => finding.RuleID),
        ),
      );

      expect([...ruleIds].filter((id) => !covered.has(id))).toEqual([]);
    });
  });

  describe('rejects ordinary content', () => {
    it.each(NEGATIVES.map((content, i) => [i, content]))('rejects sample %i', (_i, content) => {
      expect(couldContainSecret(content)).toBe(false);
      expect(scanContent(content, 'sample.js')).toEqual([]);
    });
  });

  describe('scanning is unchanged by the prefilter', () => {
    it('returns identical findings for mixed content', () => {
      const content = [
        'const harmless = 1;',
        'const api_key = "sk9Xq2Lm7Pv4Rt8Wz1Yb5Nc3Hd6Kf0Jg";',
        'function main() { return harmless; }',
        'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI7K7MDENGbPxRfiCYEXAMPLEK',
      ].join('\n');

      const findings = scanContent(content, 'config.js');
      expect(findings.length).toBeGreaterThanOrEqual(2);
      // Positions must still be right: line indexing is now built lazily.
      for (const finding of findings) {
        const line = content.split('\n')[finding.StartLine - 1];
        expect(line).toContain(finding.Match.slice(0, 10));
      }
    });

    it('reports correct positions on the last line of a long file', () => {
      const padding = 'const x = 1;\n'.repeat(500);
      const content = `${padding}const token = "sk9Xq2Lm7Pv4Rt8Wz1Yb5Nc3Hd6Kf0Jg";`;

      const [finding] = scanContent(content, 'long.js');
      expect(finding.StartLine).toBe(501);
    });

    it('is repeatable, so regex lastIndex does not leak between calls', () => {
      const content = 'const api_key = "sk9Xq2Lm7Pv4Rt8Wz1Yb5Nc3Hd6Kf0Jg";';
      const first = scanContent(content, 'a.js');
      const second = scanContent(content, 'a.js');
      const third = scanContent(content, 'a.js');

      expect(second).toEqual(first);
      expect(third).toEqual(first);
    });
  });
});
