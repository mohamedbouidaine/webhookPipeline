import { describe, expect, it } from 'vitest';
import { run, validateConfig } from '../../../src/actions/text-template';

describe('text_template', () => {
  describe('validateConfig', () => {
    it('accepts a valid template config', () => {
      expect(() => validateConfig({ template: 'Hello {{name}}' })).not.toThrow();
    });

    it('accepts a template with no mustache tags', () => {
      expect(() => validateConfig({ template: 'Static text' })).not.toThrow();
    });

    it('rejects missing template', () => {
      expect(() => validateConfig({})).toThrow();
    });

    it('rejects empty template string', () => {
      expect(() => validateConfig({ template: '' })).toThrow();
    });

    it('rejects non-string template value', () => {
      expect(() => validateConfig({ template: 123 })).toThrow();
    });

    it('rejects non-object config', () => {
      expect(() => validateConfig('Hello {{name}}')).toThrow();
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

    it('renders multiple tags in one template', () => {
      const result = run(
        { first: 'John', last: 'Doe' },
        { template: '{{first}} {{last}}' }
      );
      expect(result).toEqual({ rendered: 'John Doe' });
    });

    it('renders static template with no tags', () => {
      const result = run({ foo: 'bar' }, { template: 'No dynamic content' });
      expect(result).toEqual({ rendered: 'No dynamic content' });
    });

    it('leaves unmatched tags as empty string', () => {
      const result = run({}, { template: 'Hello {{name}}' });
      expect(result).toEqual({ rendered: 'Hello ' });
    });

    it('returns an object with only the rendered key', () => {
      const result = run({ name: 'Alice' }, { template: 'Hi {{name}}' });
      expect(Object.keys(result)).toEqual(['rendered']);
    });
  });
});
