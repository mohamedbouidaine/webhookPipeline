import { describe, expect, it } from 'vitest';
import { run, validateConfig } from '../../../src/actions/conditional-filter';

const config = (conditions: object[]) => ({ conditions });

describe('conditional_filter', () => {
  describe('validateConfig', () => {
    it('accepts valid config', () => {
      expect(() =>
        validateConfig(config([{ field: 'event', operator: 'eq', value: 'purchase' }]))
      ).not.toThrow();
    });

    it('rejects unknown operators', () => {
      expect(() =>
        validateConfig(config([{ field: 'x', operator: 'invalid' }]))
      ).toThrow();
    });

    it('rejects empty conditions array', () => {
      expect(() => validateConfig(config([]))).toThrow();
    });
  });

  describe('run', () => {
    it('passes payload through when all conditions match', () => {
      const payload = { event: 'purchase', amount: 200 };
      const result = run(payload, config([{ field: 'event', operator: 'eq', value: 'purchase' }]));
      expect(result).toEqual(payload);
    });

    it('returns filtered:true when a condition fails', () => {
      const result = run(
        { event: 'signup' },
        config([{ field: 'event', operator: 'eq', value: 'purchase' }])
      );
      expect(result).toMatchObject({ filtered: true });
    });

    it('handles gt operator', () => {
      const pass = run({ amount: 200 }, config([{ field: 'amount', operator: 'gt', value: 100 }]));
      expect(pass).toMatchObject({ amount: 200 });

      const fail = run({ amount: 50 }, config([{ field: 'amount', operator: 'gt', value: 100 }]));
      expect(fail).toMatchObject({ filtered: true });
    });

    it('handles contains operator', () => {
      const pass = run({ tag: 'vip-user' }, config([{ field: 'tag', operator: 'contains', value: 'vip' }]));
      expect(pass).toMatchObject({ tag: 'vip-user' });
    });

    it('handles exists operator', () => {
      const pass = run({ email: 'a@b.com' }, config([{ field: 'email', operator: 'exists' }]));
      expect(pass).toMatchObject({ email: 'a@b.com' });

      const fail = run({}, config([{ field: 'email', operator: 'exists' }]));
      expect(fail).toMatchObject({ filtered: true });
    });

    it('fails if ANY condition fails', () => {
      const result = run(
        { event: 'purchase', amount: 50 },
        config([
          { field: 'event', operator: 'eq', value: 'purchase' },
          { field: 'amount', operator: 'gt', value: 100 },
        ])
      );
      expect(result).toMatchObject({ filtered: true });
    });
  });
});