import { describe, expect, it } from 'vitest';
import { run, validateConfig } from '../../../src/actions/text-template';

describe('text_template', () => {
  describe('validateConfig', () => {
    it('accepts a valid template config', () => {
      expect(() => validateConfig({ template: 'Hello {{name}}' })).not.toThrow();
    });

    it('rejects missing template', () => {
      expect(() => validateConfig({})).toThrow();
    });

    it('rejects empty template', () => {
      expect(() => validateConfig({ template: '' })).toThrow();
    });
  });

  describe('run', () => {
    it('renders a simple template', () => {
      const result = run({ name: 'Alice' }, { template: 'Hello {{name}}' });
      expect(result).toEqual({ rendered: 'Hello Alice' });
    });

    it('renders nested values', () => {
      const result = run(
        { user: { name: 'Bob' }, event: 'signup' },
        { template: '{{user.name}} triggered {{event}}' }
      );
      expect(result).toEqual({ rendered: 'Bob triggered signup' });
    });

    it('leaves unmatched tags as empty string', () => {
      const result = run({}, { template: 'Hello {{name}}' });
      expect(result).toEqual({ rendered: 'Hello ' });
    });
  });
});