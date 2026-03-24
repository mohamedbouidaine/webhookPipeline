import * as conditionalFilter from './conditional-filter';
import * as jsonTransform from './json-transform';
import * as textTemplate from './text-template';

export type ActionType = 'json_transform' | 'conditional_filter' | 'text_template';

type Action = {
  validate: (config: unknown) => void;
  execute: (
    payload: Record<string, unknown>,
    config: Record<string, unknown>
  ) => Record<string, unknown>;
};

const registry: Record<ActionType, Action> = {
  json_transform:      { validate: jsonTransform.validateConfig,      execute: jsonTransform.run },
  conditional_filter:  { validate: conditionalFilter.validateConfig,  execute: conditionalFilter.run },
  text_template:       { validate: textTemplate.validateConfig,       execute: textTemplate.run },
};

export const VALID_ACTION_TYPES = Object.keys(registry) as ActionType[];

export function validateActionConfig(actionType: string, config: unknown): void {
  const action = registry[actionType as ActionType];
  if (!action) throw new Error(`Unknown action type: "${actionType}"`);
  action.validate(config);
}

export function executeAction(
  actionType: string,
  payload: Record<string, unknown>,
  config: Record<string, unknown>
): Record<string, unknown> {
  const action = registry[actionType as ActionType];
  if (!action) throw new Error(`Unknown action type: "${actionType}"`);
  return action.execute(payload, config);
}
