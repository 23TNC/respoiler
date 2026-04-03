import type {
  AppliedEffect,
  EvaluationResult,
  RecipeCondition,
  RecipeDefinition,
  RecipeEffect,
  RecipeEvaluationContext,
  RecipeOp,
  RecipeValue,
  RecipeValueBag,
} from './types';

interface EffectAccumulatorEntry {
  eq?: RecipeValue;
  ge?: number;
  le?: number;
}

function cloneBag(values?: RecipeValueBag): RecipeValueBag {
  return { ...(values ?? {}) };
}

export function compareByOp(left: RecipeValue | undefined, op: RecipeOp, right: RecipeValue): boolean {
  if (left === undefined) {
    return false;
  }

  switch (op) {
    case 'eq':
      return left === right;
    case 'ge':
      return typeof left === 'number' && typeof right === 'number' && left >= right;
    case 'le':
      return typeof left === 'number' && typeof right === 'number' && left <= right;
    case 'gt':
      return typeof left === 'number' && typeof right === 'number' && left > right;
    case 'lt':
      return typeof left === 'number' && typeof right === 'number' && left < right;
  }
}

export function readValueByType(context: RecipeEvaluationContext, condition: RecipeCondition): RecipeValue | undefined {
  switch (condition.type) {
    case 'tile':
      return condition.id ? context.tile.attributes?.[condition.id] : context.tile.id;
    case 'action':
      return condition.id ? context.action.attributes?.[condition.id] : context.action.id;
    case 'aspect':
      return condition.id ? context.aspect.attributes?.[condition.id] : context.aspect.id;
    case 'character':
      if (!context.character) {
        return undefined;
      }
      return condition.id ? context.character.attributes?.[condition.id] : context.character.id;
    case 'item':
      return condition.id ? context.items?.[condition.id] : undefined;
    case 'random':
      return (context.random ?? Math.random)();
  }
}

function queueEffect(accumulator: Map<string, EffectAccumulatorEntry>, effect: RecipeEffect): void {
  const key = `${effect.type}:${effect.id ?? '__id__'}`;
  const current = accumulator.get(key) ?? {};

  if (effect.op === 'eq') {
    current.eq = effect.value;
  } else if (effect.op === 'ge' && typeof effect.value === 'number') {
    current.ge = current.ge === undefined ? effect.value : Math.max(current.ge, effect.value);
  } else if (effect.op === 'le' && typeof effect.value === 'number') {
    current.le = current.le === undefined ? effect.value : Math.min(current.le, effect.value);
  }

  accumulator.set(key, current);
}

export function applyEffectBounds(target: RecipeValueBag, effect: RecipeEffect): AppliedEffect | null {
  if (!effect.id) {
    return null;
  }

  if (effect.op === 'eq') {
    target[effect.id] = effect.value;
    return { type: effect.type, id: effect.id, op: 'eq', value: effect.value };
  }

  if (typeof effect.value !== 'number') {
    return null;
  }

  const current = target[effect.id];
  const numericCurrent = typeof current === 'number' ? current : undefined;

  if (effect.op === 'ge') {
    target[effect.id] = numericCurrent === undefined ? effect.value : Math.max(numericCurrent, effect.value);
    return { type: effect.type, id: effect.id, op: 'ge', value: effect.value };
  }

  if (effect.op === 'le') {
    target[effect.id] = numericCurrent === undefined ? effect.value : Math.min(numericCurrent, effect.value);
    return { type: effect.type, id: effect.id, op: 'le', value: effect.value };
  }

  return null;
}

function normalizeId(value: string): string {
  return value.trim().toLowerCase();
}

function inputMatches(recipe: RecipeDefinition, context: RecipeEvaluationContext): boolean {
  return (
    normalizeId(recipe.inputs.tile) === normalizeId(context.tile.id)
    && normalizeId(recipe.inputs.action) === normalizeId(context.action.id)
    && normalizeId(recipe.inputs.aspect) === normalizeId(context.aspect.id)
  );
}

export function evaluateRecipes(context: RecipeEvaluationContext): EvaluationResult {
  const producedOutputs: EvaluationResult['producedOutputs'] = [];
  const queuedEffects: EvaluationResult['queuedEffects'] = [];
  const traces: EvaluationResult['traces'] = [];

  const tileState = cloneBag(context.tile.attributes);
  const actionState = cloneBag(context.action.attributes);
  const aspectState = cloneBag(context.aspect.attributes);
  const characterState = cloneBag(context.character?.attributes);
  const itemState = cloneBag(context.items);

  for (const [recipeIndex, recipe] of context.recipes.entries()) {
    const matchesInput = inputMatches(recipe, context);

    const outputResults: EvaluationResult['traces'][number]['outputResults'] = [];
    if (!matchesInput) {
      for (const [outputIndex] of recipe.outputs.entries()) {
        outputResults.push({ outputIndex, matched: false, failedConditionIndexes: [] });
      }
      traces.push({ recipeIndex, inputMatched: false, outputResults });
      continue;
    }

    for (const [outputIndex, output] of recipe.outputs.entries()) {
      const conditions = output.conditions ?? [];
      const failedConditionIndexes: number[] = [];

      conditions.forEach((condition, conditionIndex) => {
        const value = readValueByType(context, condition);
        if (!compareByOp(value, condition.op, condition.value)) {
          failedConditionIndexes.push(conditionIndex);
        }
      });

      const matched = failedConditionIndexes.length === 0;
      outputResults.push({ outputIndex, matched, failedConditionIndexes });

      if (!matched) {
        continue;
      }

      producedOutputs.push({
        recipeIndex,
        outputIndex,
        id: output.id,
        amount: output.amount,
      });

      for (const [effectIndex, effect] of (output.effects ?? []).entries()) {
        queuedEffects.push({ recipeIndex, outputIndex, effectIndex, effect });
      }
    }

    traces.push({ recipeIndex, inputMatched: true, outputResults });
  }

  const effectByTarget = new Map<string, EffectAccumulatorEntry>();
  for (const queued of queuedEffects) {
    queueEffect(effectByTarget, queued.effect);
  }

  const appliedEffects: AppliedEffect[] = [];

  for (const [key, aggregate] of effectByTarget.entries()) {
    const [type, id] = key.split(':');
    const cleanId = id === '__id__' ? undefined : id;

    let target: RecipeValueBag | undefined;
    if (type === 'tile') {
      target = tileState;
    } else if (type === 'action') {
      target = actionState;
    } else if (type === 'aspect') {
      target = aspectState;
    } else if (type === 'character') {
      target = characterState;
    }

    if (!target || !cleanId) {
      continue;
    }

    // Apply in deterministic order after all output checks complete.
    if (aggregate.eq !== undefined) {
      const applied = applyEffectBounds(target, { type: type as RecipeEffect['type'], id: cleanId, op: 'eq', value: aggregate.eq });
      if (applied) {
        appliedEffects.push(applied);
      }
      continue;
    }

    if (aggregate.ge !== undefined) {
      const applied = applyEffectBounds(target, { type: type as RecipeEffect['type'], id: cleanId, op: 'ge', value: aggregate.ge });
      if (applied) {
        appliedEffects.push(applied);
      }
    }

    if (aggregate.le !== undefined) {
      const applied = applyEffectBounds(target, { type: type as RecipeEffect['type'], id: cleanId, op: 'le', value: aggregate.le });
      if (applied) {
        appliedEffects.push(applied);
      }
    }
  }

  return {
    producedOutputs,
    queuedEffects,
    appliedEffects,
    traces,
    finalState: {
      tile: tileState,
      action: actionState,
      aspect: aspectState,
      character: characterState,
      items: itemState,
    },
  };
}
