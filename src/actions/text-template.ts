import Mustache from 'mustache';
import { z } from 'zod';

const ConfigSchema = z.object({
  template: z.string().min(1, 'Template string is required'),
});

export function validateConfig(config: unknown): void {
  ConfigSchema.parse(config);
}

export function run(
  payload: Record<string, unknown>,
  config: Record<string, unknown>
): Record<string, unknown> {
  const { template } = ConfigSchema.parse(config);
  const rendered = Mustache.render(template, payload);
  return { rendered };
}
