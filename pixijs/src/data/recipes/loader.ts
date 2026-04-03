import rawRecipes from './base.recipes.json';
import type { RecipeCondition, RecipeConditionType, RecipeDefinition, RecipeEffect, RecipeOp } from '../../game/recipes/types';

const VALID_TYPES = new Set(['tile', 'action', 'aspect', 'character', 'item', 'random']);
const VALID_EFFECT_TYPES = new Set(['tile', 'action', 'aspect', 'character']);
const VALID_OPS = new Set<RecipeOp>(['eq', 'ge', 'le', 'gt', 'lt']);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Recipe data validation failed: ${message}`);
  }
}

function parseCondition(input: unknown, path: string): RecipeCondition {
  assert(isObject(input), `${path} must be an object`);
  assert(typeof input.type === 'string' && VALID_TYPES.has(input.type), `${path}.type is invalid`);
  assert(typeof input.op === 'string' && VALID_OPS.has(input.op as RecipeOp), `${path}.op is invalid`);
  assert(
    typeof input.value === 'string' || typeof input.value === 'number' || typeof input.value === 'boolean',
    `${path}.value must be string | number | boolean`,
  );

  if (input.type === 'random') {
    assert(input.id === undefined, `${path}.id is not allowed for random`);
    assert(typeof input.value === 'number', `${path}.value must be number for random`);
  }

  if (input.type !== 'random' && input.id !== undefined) {
    assert(typeof input.id === 'string', `${path}.id must be string`);
  }

  return {
    type: input.type as RecipeConditionType,
    id: typeof input.id === 'string' ? input.id : undefined,
    op: input.op as RecipeOp,
    value: input.value,
  };
}

function parseEffect(input: unknown, path: string): RecipeEffect {
  const parsed = parseCondition(input, path);
  assert(VALID_EFFECT_TYPES.has(parsed.type), `${path}.type is not supported for effects`);
  return parsed as RecipeEffect;
}

export function loadRecipes(): RecipeDefinition[] {
  assert(Array.isArray(rawRecipes), 'root must be an array');

  return rawRecipes.map((recipe, recipeIndex) => {
    const path = `recipes[${recipeIndex}]`;
    assert(isObject(recipe), `${path} must be object`);
    assert(isObject(recipe.inputs), `${path}.inputs must be object`);
    assert(typeof recipe.inputs.tile === 'string', `${path}.inputs.tile must be string`);
    assert(typeof recipe.inputs.action === 'string', `${path}.inputs.action must be string`);
    assert(typeof recipe.inputs.aspect === 'string', `${path}.inputs.aspect must be string`);
    assert(Array.isArray(recipe.outputs), `${path}.outputs must be array`);

    return {
      inputs: {
        tile: recipe.inputs.tile,
        action: recipe.inputs.action,
        aspect: recipe.inputs.aspect,
      },
      outputs: recipe.outputs.map((output, outputIndex) => {
        const outputPath = `${path}.outputs[${outputIndex}]`;
        assert(isObject(output), `${outputPath} must be object`);
        assert(typeof output.id === 'string', `${outputPath}.id must be string`);
        assert(typeof output.amount === 'number', `${outputPath}.amount must be number`);

        return {
          id: output.id,
          amount: output.amount,
          conditions: Array.isArray(output.conditions)
            ? output.conditions.map((condition, conditionIndex) =>
                parseCondition(condition, `${outputPath}.conditions[${conditionIndex}]`),
              )
            : undefined,
          effects: Array.isArray(output.effects)
            ? output.effects.map((effect, effectIndex) => parseEffect(effect, `${outputPath}.effects[${effectIndex}]`))
            : undefined,
        };
      }),
    };
  });
}
