import { describe, expect, it } from 'vitest';
import { run, validateConfig } from '../../../src/actions/json-transform';

describe('json_transform', () => {
  describe('validateConfig', () => {
    it('accepts a valid mapping config', () => {
      expect(() => validateConfig({ userId: 'user.id' })).not.toThrow();
    });

    it('accepts an empty config object', () => {
      expect(() => validateConfig({})).not.toThrow();
    });

    it('rejects non-string values', () => {
      expect(() => validateConfig({ userId: 123 })).toThrow();
    });

    it('rejects a non-object config', () => {
      expect(() => validateConfig('not-an-object')).toThrow();
      expect(() => validateConfig(null)).toThrow();
    });

    it('rejects an array config', () => {
      expect(() => validateConfig([{ userId: 'user.id' }])).toThrow();
    });
  });

  describe('run', () => {
    it('maps top-level fields', () => {
      const result = run({ event: 'signup' }, { type: 'event' });
      expect(result).toEqual({ type: 'signup' });
    });

    it('maps nested fields using dot notation', () => {
      const result = run(
        { user: { id: 42, name: 'Alice' } },
        { userId: 'user.id', userName: 'user.name' }
      );
      expect(result).toEqual({ userId: 42, userName: 'Alice' });
    });

    it('maps deeply nested fields', () => {
      const result = run(
        { a: { b: { c: 'deep' } } },
        { value: 'a.b.c' }
      );
      expect(result).toEqual({ value: 'deep' });
    });

    it('returns undefined for missing nested path', () => {
      const result = run({ user: {} }, { userId: 'user.id' });
      expect(result).toEqual({ userId: undefined });
    });

    it('returns undefined for completely missing top-level key', () => {
      const result = run({}, { userId: 'user.id' });
      expect(result).toEqual({ userId: undefined });
    });

    it('returns empty object for empty config', () => {
      expect(run({ foo: 'bar' }, {})).toEqual({});
    });

    it('maps multiple output keys from different source paths', () => {
      const result = run(
        { user: { id: 1, email: 'test@example.com' }, event: 'signup' },
        { id: 'user.id', email: 'user.email', eventType: 'event' }
      );
      expect(result).toEqual({ id: 1, email: 'test@example.com', eventType: 'signup' });
    });

    it('does not include extra payload fields not in the config', () => {
      const result = run(
        { user: { id: 1, secret: 'hidden' } },
        { userId: 'user.id' }
      );
      expect(result).toEqual({ userId: 1 });
      expect('secret' in result).toBe(false);
    });
  });
});