import type {
  AppliedEffect,
  EvaluationResult,
  RecipeEvaluationContext,
  RecipeExpr,
  RecipeFile,
  RecipeOp,
  RecipeValue,
  RecipeValueBag,
} from './types';

interface RefTarget {
  kind: 'input' | 'output';
  entityId: string;
  field: string;
}

interface EvalEnv {
  snapshot: Record<string, RecipeValueBag>;
  // Buffered writes keyed by symbolic ref. This prevents direct live mutation and
  // ensures multiple writes in one execution observe previous buffered writes.
  writeBuffer: Map<string, RecipeValue>;
  outputState: Record<string, RecipeValueBag>;
  random: () => number;
}

type EvalResult =
  | { kind: 'value'; value: RecipeValue }
  | { kind: 'ref'; ref: RefTarget };

const COMPARISON_OPS = new Set<RecipeOp>(['eq', 'ne', 'lt', 'le', 'gt', 'ge']);
const ARITHMETIC_OPS = new Set<RecipeOp>(['add', 'sub', 'mul', 'div']);
const APPLY_OPS = new Set<RecipeOp>(['apply_eq', 'apply_le', 'apply_ge', 'apply_add', 'apply_sub', 'apply_mul', 'apply_div']);

function normalizeId(value: string): string {
  return value.trim().toLowerCase();
}

function cloneBag(values?: RecipeValueBag): RecipeValueBag {
  return { ...(values ?? {}) };
}

function refKey(ref: RefTarget): string {
  return `${ref.kind}:${normalizeId(ref.entityId)}:${normalizeId(ref.field)}`;
}

function getSnapshotValue(env: EvalEnv, ref: RefTarget): RecipeValue {
  const source = ref.kind === 'output' ? env.outputState : env.snapshot;
  return source[normalizeId(ref.entityId)]?.[normalizeId(ref.field)] ?? 0;
}

function readRef(env: EvalEnv, ref: RefTarget): RecipeValue {
  const key = refKey(ref);
  if (env.writeBuffer.has(key)) {
    return env.writeBuffer.get(key) as RecipeValue;
  }
  return getSnapshotValue(env, ref);
}

// Seed from snapshot/output snapshot on first write, then keep writing to buffer.
function writeRef(env: EvalEnv, ref: RefTarget, value: RecipeValue): void {
  const key = refKey(ref);
  if (!env.writeBuffer.has(key)) {
    env.writeBuffer.set(key, getSnapshotValue(env, ref));
  }
  env.writeBuffer.set(key, value);
}

function asValue(result: EvalResult, env: EvalEnv): RecipeValue {
  return result.kind === 'value' ? result.value : readRef(env, result.ref);
}

function asRef(result: EvalResult): RefTarget {
  if (result.kind !== 'ref') {
    throw new Error('Expression requires ref but resolved to value.');
  }
  return result.ref;
}

function compare(left: RecipeValue, op: RecipeOp, right: RecipeValue): boolean {
  if (op === 'eq') return left === right;
  if (op === 'ne') return left !== right;
  if (typeof left !== 'number' || typeof right !== 'number') return false;
  if (op === 'lt') return left < right;
  if (op === 'le') return left <= right;
  if (op === 'gt') return left > right;
  if (op === 'ge') return left >= right;
  return false;
}

function evaluateExpr(expr: RecipeExpr, env: EvalEnv): EvalResult {
  if ('value' in expr) {
    return { kind: 'value', value: expr.value };
  }

  const left = evaluateExpr(expr.lhs, env);
  const right = expr.rhs ? evaluateExpr(expr.rhs, env) : undefined;

  if (expr.op === 'input_val') {
    const entityId = asValue(left, env);
    const field = right ? asValue(right, env) : undefined;
    if (typeof entityId !== 'string' || typeof field !== 'string') return { kind: 'value', value: 0 };
    return {
      kind: 'value',
      value: env.snapshot[normalizeId(entityId)]?.[normalizeId(field)] ?? 0,
    };
  }

  if (expr.op === 'input_ref' || expr.op === 'output_ref') {
    const entityId = asValue(left, env);
    const field = right ? asValue(right, env) : undefined;
    if (typeof entityId !== 'string' || typeof field !== 'string') {
      throw new Error(`${expr.op} expects string binding id + field`);
    }
    return {
      kind: 'ref',
      ref: {
        kind: expr.op === 'input_ref' ? 'input' : 'output',
        entityId,
        field,
      },
    };
  }

  if (APPLY_OPS.has(expr.op)) {
    const targetRef = asRef(left);
    const rhsValue = right ? asValue(right, env) : 0;
    const current = readRef(env, targetRef);

    if (expr.op === 'apply_eq') {
      writeRef(env, targetRef, rhsValue);
      return { kind: 'value', value: rhsValue };
    }

    const numericCurrent = typeof current === 'number' ? current : 0;
    const numericRhs = typeof rhsValue === 'number' ? rhsValue : 0;

    let next = numericCurrent;
    if (expr.op === 'apply_ge') next = Math.max(numericCurrent, numericRhs);
    if (expr.op === 'apply_le') next = Math.min(numericCurrent, numericRhs);
    if (expr.op === 'apply_add') next = numericCurrent + numericRhs;
    if (expr.op === 'apply_sub') next = numericCurrent - numericRhs;
    if (expr.op === 'apply_mul') next = numericCurrent * numericRhs;
    if (expr.op === 'apply_div') next = numericRhs === 0 ? numericCurrent : numericCurrent / numericRhs;

    writeRef(env, targetRef, next);
    return { kind: 'value', value: next };
  }

  const leftValue = asValue(left, env);
  const rightValue = right ? asValue(right, env) : 0;

  if (COMPARISON_OPS.has(expr.op)) {
    return { kind: 'value', value: compare(leftValue, expr.op, rightValue) };
  }

  if (ARITHMETIC_OPS.has(expr.op)) {
    const lhs = typeof leftValue === 'number' ? leftValue : 0;
    const rhs = typeof rightValue === 'number' ? rightValue : 0;
    if (expr.op === 'add') return { kind: 'value', value: lhs + rhs };
    if (expr.op === 'sub') return { kind: 'value', value: lhs - rhs };
    if (expr.op === 'mul') return { kind: 'value', value: lhs * rhs };
    return { kind: 'value', value: rhs === 0 ? lhs : lhs / rhs };
  }

  if (expr.op === 'rand') {
    const min = typeof leftValue === 'number' ? leftValue : 0;
    const max = typeof rightValue === 'number' ? rightValue : min;
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    return { kind: 'value', value: Math.floor(env.random() * (high - low + 1)) + low };
  }

  if (expr.op === 'max') {
    const lhs = typeof leftValue === 'number' ? leftValue : 0;
    const rhs = typeof rightValue === 'number' ? rightValue : 0;
    return { kind: 'value', value: Math.max(lhs, rhs) };
  }

  if (expr.op === 'hex_dist') {
    return { kind: 'value', value: 0 };
  }

  if (expr.op === 'select_one') {
    return { kind: 'value', value: leftValue };
  }

  return { kind: 'value', value: 0 };
}

function evaluatePredicateList(all: RecipeExpr[] | undefined, any: RecipeExpr[] | undefined, env: EvalEnv): boolean {
  const allOk = (all ?? []).every((expr) => Boolean(asValue(evaluateExpr(expr, env), env)));
  const anyList = any ?? [];
  const anyOk = anyList.length === 0 || anyList.some((expr) => Boolean(asValue(evaluateExpr(expr, env), env)));
  return allOk && anyOk;
}

function toNumber(value: RecipeValue): number {
  return typeof value === 'number' ? value : Number(value) || 0;
}

function applyBuffer(snapshot: Record<string, RecipeValueBag>, outputState: Record<string, RecipeValueBag>, writeBuffer: Map<string, RecipeValue>): Record<string, RecipeValueBag> {
  const finalState: Record<string, RecipeValueBag> = {};
  for (const [id, bag] of Object.entries(snapshot)) {
    finalState[id] = cloneBag(bag);
  }
  for (const [id, bag] of Object.entries(outputState)) {
    finalState[id] = { ...(finalState[id] ?? {}), ...cloneBag(bag) };
  }

  for (const [key, value] of writeBuffer.entries()) {
    const [, entityId, field] = key.split(':');
    finalState[entityId] = finalState[entityId] ?? {};
    finalState[entityId][field] = value;
  }

  return finalState;
}

function findActionFile(action: string, recipes: RecipeFile[]): RecipeFile | undefined {
  const target = normalizeId(action);
  return recipes.find((recipeFile) => normalizeId(recipeFile.actionKey) === target);
}

export function evaluateRecipes(context: RecipeEvaluationContext): EvaluationResult {
  const recipeFile = findActionFile(context.action, context.recipes);
  if (!recipeFile) {
    return {
      producedOutputs: [],
      queuedEffects: [],
      appliedEffects: [],
      traces: [],
      finalState: {},
    };
  }

  // Snapshot is immutable for eligibility checks.
  const snapshot: Record<string, RecipeValueBag> = {};
  for (const [id, bag] of Object.entries(context.entities)) {
    snapshot[normalizeId(id)] = cloneBag(bag);
  }

  const producedOutputs: EvaluationResult['producedOutputs'] = [];
  const queuedEffects: EvaluationResult['queuedEffects'] = [];
  const traces: EvaluationResult['traces'] = [];
  const writeBuffer = new Map<string, RecipeValue>();
  const outputState: Record<string, RecipeValueBag> = {};

  const env: EvalEnv = {
    snapshot,
    writeBuffer,
    outputState,
    random: context.random ?? Math.random,
  };

  for (const [recipeIndex, recipe] of recipeFile.recipes.entries()) {
    const inputMatched = recipe.input.every((binding) => evaluatePredicateList(binding.all, binding.any, env));
    const outputResults: EvaluationResult['traces'][number]['outputResults'] = [];

    if (!inputMatched) {
      for (const [outputIndex] of recipe.output.entries()) {
        outputResults.push({ outputIndex, matched: false, failedConditionIndexes: [] });
      }
      traces.push({ recipeIndex, inputMatched: false, outputResults });
      continue;
    }

    for (const [outputIndex, output] of recipe.output.entries()) {
      const all = output.all ?? [];
      const any = output.any ?? [];
      const failedConditionIndexes: number[] = [];

      all.forEach((expr, conditionIndex) => {
        if (!Boolean(asValue(evaluateExpr(expr, env), env))) {
          failedConditionIndexes.push(conditionIndex);
        }
      });
      if (any.length > 0 && !any.some((expr) => Boolean(asValue(evaluateExpr(expr, env), env)))) {
        failedConditionIndexes.push(all.length);
      }

      const matched = failedConditionIndexes.length === 0;
      outputResults.push({ outputIndex, matched, failedConditionIndexes });
      if (!matched) continue;

      const amount = toNumber(output.count ? asValue(evaluateExpr(output.count, env), env) : 1);
      outputState[normalizeId(String(output.id))] = {
        ...(outputState[normalizeId(String(output.id))] ?? {}),
        count: amount,
      };

      producedOutputs.push({ recipeIndex, outputIndex, id: output.id, amount });

      for (const [effectIndex, effect] of (output.effects ?? []).entries()) {
        queuedEffects.push({ recipeIndex, outputIndex, effectIndex, effect });
        const result = evaluateExpr(effect, env);
        const value = asValue(result, env);
        appliedEffectFromResult(effect, value, env, String(output.id));
      }
    }

    for (const [effectIndex, effect] of (recipe.effects ?? []).entries()) {
      queuedEffects.push({ recipeIndex, outputIndex: null, effectIndex, effect });
      const result = evaluateExpr(effect, env);
      const value = asValue(result, env);
      appliedEffectFromResult(effect, value, env, String(recipe.id));
    }

    traces.push({ recipeIndex, inputMatched: true, outputResults });
  }

  const appliedEffects = collectAppliedEffects(writeBuffer);

  return {
    producedOutputs,
    queuedEffects,
    appliedEffects,
    traces,
    finalState: applyBuffer(snapshot, outputState, writeBuffer),
  };
}

function collectAppliedEffects(writeBuffer: Map<string, RecipeValue>): AppliedEffect[] {
  const effects: AppliedEffect[] = [];
  for (const [ref, value] of writeBuffer.entries()) {
    effects.push({ ref, op: 'apply_eq', value });
  }
  return effects;
}

function appliedEffectFromResult(_expr: RecipeExpr, _value: RecipeValue, _env: EvalEnv, _tag: string): void {
  // intentionally empty: applied effects are derived from buffered writes for deterministic commit output.
}
