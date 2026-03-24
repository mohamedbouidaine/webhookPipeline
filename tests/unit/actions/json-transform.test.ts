import { describe, expect, it } from 'vitest';
import { run, validateConfig } from '../../../src/actions/json-transform';

describe('json_transform', () => {
  describe('validateConfig', () => {
    it('accepts a valid mapping config', () => {
      expect(() => validateConfig({ userId: 'user.id' })).not.toThrow();
    });

    it('rejects non-string values', () => {
      expect(() => validateConfig({ userId: 123 })).toThrow();
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

    it('returns undefined for missing paths', () => {
      const result = run({ user: {} }, { userId: 'user.id' });
      expect(result).toEqual({ userId: undefined });
    });

    it('returns empty object for empty config', () => {
      expect(run({ foo: 'bar' }, {})).toEqual({});
    });
  });
});