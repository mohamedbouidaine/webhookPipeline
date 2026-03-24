import { z } from 'zod';
import { getNestedValue } from './utils';

// Config shape: { "userId": "user.id", "eventName": "event.type" }
const ConfigSchema = z.record(z.string());

export function validateConfig(config: unknown): void {
  ConfigSchema.parse(config);
}

export function run(
  payload: Record<string, unknown>,
  config: Record<string, unknown>
): Record<string, unknown> {
  const mapping = ConfigSchema.parse(config);
  const result: Record<string, unknown> = {};

  for (const [outputKey, sourcePath] of Object.entries(mapping)) {
    result[outputKey] = getNestedValue(payload, sourcePath);
  }

  return result;
}
