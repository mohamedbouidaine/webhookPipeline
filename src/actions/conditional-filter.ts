import { z } from 'zod';
import { getNestedValue } from './utils';

const ConditionSchema = z.object({
  field:    z.string(),
  operator: z.enum(['eq', 'neq', 'gt', 'lt', 'contains', 'exists']),
  value:    z.unknown().optional(),
});

const ConfigSchema = z.object({
  conditions: z.array(ConditionSchema).min(1),
});

type Condition = z.infer<typeof ConditionSchema>;

function evaluateCondition(
  payload: Record<string, unknown>,
  condition: Condition
): boolean {
  const fieldValue = getNestedValue(payload, condition.field);

  switch (condition.operator) {
    case 'eq':      return fieldValue === condition.value;
    case 'neq':     return fieldValue !== condition.value;
    case 'gt':      return typeof fieldValue === 'number' && typeof condition.value === 'number' && fieldValue > condition.value;
    case 'lt':      return typeof fieldValue === 'number' && typeof condition.value === 'number' && fieldValue < condition.value;
    case 'contains':return typeof fieldValue === 'string' && typeof condition.value === 'string' && fieldValue.includes(condition.value);
    case 'exists':  return fieldValue !== undefined && fieldValue !== null;
    default:        return false;
  }
}

export function validateConfig(config: unknown): void {
  ConfigSchema.parse(config);
}

export function run(
  payload: Record<string, unknown>,
  config: Record<string, unknown>
): Record<string, unknown> {
  const { conditions } = ConfigSchema.parse(config);

  const failed = conditions.find((c) => !evaluateCondition(payload, c));

  if (failed) {
    return {
      filtered: true,
      reason: `Field "${failed.field}" did not satisfy operator "${failed.operator}"`,
    };
  }

  return payload;
}
