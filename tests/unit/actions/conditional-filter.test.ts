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

    it('rejects config with no conditions key', () => {
      expect(() => validateConfig({})).toThrow();
    });

    it('rejects non-object config', () => {
      expect(() => validateConfig('invalid')).toThrow();
      expect(() => validateConfig(null)).toThrow();
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

    it('includes a reason string when filtered', () => {
      const result = run(
        { event: 'signup' },
        config([{ field: 'event', operator: 'eq', value: 'purchase' }])
      ) as { filtered: boolean; reason: string };
      expect(result.reason).toContain('event');
      expect(result.reason).toContain('eq');
    });

    it('handles gt operator', () => {
      const pass = run({ amount: 200 }, config([{ field: 'amount', operator: 'gt', value: 100 }]));
      expect(pass).toMatchObject({ amount: 200 });

      const fail = run({ amount: 50 }, config([{ field: 'amount', operator: 'gt', value: 100 }]));
      expect(fail).toMatchObject({ filtered: true });
    });

    it('handles lt operator', () => {
      const pass = run({ amount: 50 }, config([{ field: 'amount', operator: 'lt', value: 100 }]));
      expect(pass).toMatchObject({ amount: 50 });

      const fail = run({ amount: 200 }, config([{ field: 'amount', operator: 'lt', value: 100 }]));
      expect(fail).toMatchObject({ filtered: true });
    });

    it('handles neq operator', () => {
      const pass = run({ status: 'active' }, config([{ field: 'status', operator: 'neq', value: 'inactive' }]));
      expect(pass).toMatchObject({ status: 'active' });

      const fail = run({ status: 'inactive' }, config([{ field: 'status', operator: 'neq', value: 'inactive' }]));
      expect(fail).toMatchObject({ filtered: true });
    });

    it('handles contains operator', () => {
      const pass = run({ tag: 'vip-user' }, config([{ field: 'tag', operator: 'contains', value: 'vip' }]));
      expect(pass).toMatchObject({ tag: 'vip-user' });

      const fail = run({ tag: 'regular-user' }, config([{ field: 'tag', operator: 'contains', value: 'vip' }]));
      expect(fail).toMatchObject({ filtered: true });
    });

    it('handles exists operator', () => {
      const pass = run({ email: 'a@b.com' }, config([{ field: 'email', operator: 'exists' }]));
      expect(pass).toMatchObject({ email: 'a@b.com' });

      const fail = run({}, config([{ field: 'email', operator: 'exists' }]));
      expect(fail).toMatchObject({ filtered: true });
    });

    it('treats null field value as non-existent for exists operator', () => {
      const result = run({ email: null }, config([{ field: 'email', operator: 'exists' }]));
      expect(result).toMatchObject({ filtered: true });
    });

    it('handles nested field paths', () => {
      const pass = run(
        { user: { role: 'admin' } },
        config([{ field: 'user.role', operator: 'eq', value: 'admin' }])
      );
      expect(pass).toMatchObject({ user: { role: 'admin' } });

      const fail = run(
        { user: { role: 'viewer' } },
        config([{ field: 'user.role', operator: 'eq', value: 'admin' }])
      );
      expect(fail).toMatchObject({ filtered: true });
    });

    it('treats non-numeric values as failing gt/lt operator', () => {
      const result = run({ amount: 'big' }, config([{ field: 'amount', operator: 'gt', value: 0 }]));
      expect(result).toMatchObject({ filtered: true });
    });

    it('fails if ANY condition fails (short-circuits on first failure)', () => {
      const result = run(
        { event: 'purchase', amount: 50 },
        config([
          { field: 'event', operator: 'eq', value: 'purchase' },
          { field: 'amount', operator: 'gt', value: 100 },
        ])
      );
      expect(result).toMatchObject({ filtered: true });
    });

    it('passes when all multiple conditions match', () => {
      const payload = { event: 'purchase', amount: 200, tag: 'vip-user' };
      const result = run(
        payload,
        config([
          { field: 'event', operator: 'eq', value: 'purchase' },
          { field: 'amount', operator: 'gt', value: 100 },
          { field: 'tag', operator: 'contains', value: 'vip' },
        ])
      );
      expect(result).toEqual(payload);
    });
  });
});