import rawRecipes from './base.recipes.json';
import type {
  InputBinding,
  OutputBinding,
  RecipeDefinition,
  RecipeExpr,
  RecipeFile,
  RecipeOp,
} from '../../game/recipes/types';

const VALUE_OPS = new Set<RecipeOp>([
  'eq', 'ne', 'lt', 'le', 'gt', 'ge',
  'add', 'sub', 'mul', 'div',
  'input_val', 'rand', 'max', 'hex_dist', 'select_one',
]);
const REF_OPS = new Set<RecipeOp>(['input_ref', 'output_ref']);
const APPLY_OPS = new Set<RecipeOp>(['apply_eq', 'apply_le', 'apply_ge', 'apply_add', 'apply_sub', 'apply_mul', 'apply_div']);
const COMPARISON_OPS = new Set<RecipeOp>(['eq', 'ne', 'lt', 'le', 'gt', 'ge']);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Recipe data validation failed: ${message}`);
  }
}

function parseExpr(input: unknown, path: string): RecipeExpr {
  assert(isObject(input), `${path} must be an object`);

  if ('value' in input) {
    assert(typeof input.value === 'string' || typeof input.value === 'number', `${path}.value must be string | number`);
    return { value: input.value };
  }

  assert('lhs' in input, `${path}.lhs is required`);
  assert('op' in input, `${path}.op is required`);
  assert(typeof input.op === 'string', `${path}.op must be string`);
  const op = input.op as RecipeOp;
  assert(VALUE_OPS.has(op) || REF_OPS.has(op) || APPLY_OPS.has(op), `${path}.op is invalid`);

  const expr: RecipeExpr = {
    lhs: parseExpr(input.lhs, `${path}.lhs`),
    op,
    rhs: input.rhs === undefined ? undefined : parseExpr(input.rhs, `${path}.rhs`),
  };

  validateExprKinds(expr, path);
  return expr;
}

type ExprKind = 'value' | 'ref';

function inferExprKind(expr: RecipeExpr, path: string): ExprKind {
  if ('value' in expr) {
    return 'value';
  }

  if (REF_OPS.has(expr.op)) {
    return 'ref';
  }

  if (APPLY_OPS.has(expr.op)) {
    return 'value';
  }

  if (expr.rhs) {
    inferExprKind(expr.rhs, `${path}.rhs`);
  }
  inferExprKind(expr.lhs, `${path}.lhs`);
  return 'value';
}

function validateExprKinds(expr: RecipeExpr, path: string): void {
  if ('value' in expr) {
    return;
  }

  const lhsKind = inferExprKind(expr.lhs, `${path}.lhs`);
  const rhsKind = expr.rhs ? inferExprKind(expr.rhs, `${path}.rhs`) : 'value';

  if (APPLY_OPS.has(expr.op)) {
    assert(lhsKind === 'ref', `${path}.lhs must resolve to a ref for ${expr.op}`);
    if (expr.rhs) {
      assert(rhsKind === 'value' || rhsKind === 'ref', `${path}.rhs must resolve to value/ref for ${expr.op}`);
    }
  }

  if (COMPARISON_OPS.has(expr.op)) {
    assert(lhsKind === 'value', `${path}.lhs must resolve to a value for ${expr.op}`);
    if (expr.rhs) {
      assert(rhsKind === 'value', `${path}.rhs must resolve to a value for ${expr.op}`);
    }
  }

  if (expr.op === 'input_val') {
    assert(expr.rhs !== undefined, `${path}.rhs is required for input_val`);
    assert('value' in expr.lhs && typeof expr.lhs.value === 'string', `${path}.lhs.value must be input id string for input_val`);
    assert('value' in expr.rhs && typeof expr.rhs.value === 'string', `${path}.rhs.value must be field id string for input_val`);
  }

  if (expr.op === 'input_ref' || expr.op === 'output_ref') {
    assert(expr.rhs !== undefined, `${path}.rhs is required for ${expr.op}`);
    assert('value' in expr.lhs && typeof expr.lhs.value === 'string', `${path}.lhs.value must be binding id string for ${expr.op}`);
    assert('value' in expr.rhs && typeof expr.rhs.value === 'string', `${path}.rhs.value must be field id string for ${expr.op}`);
  }

  if (expr.rhs) {
    validateExprKinds(expr.rhs, `${path}.rhs`);
  }
  validateExprKinds(expr.lhs, `${path}.lhs`);
}

function parseBindings<T extends InputBinding | OutputBinding>(
  input: unknown,
  path: string,
  parseExtra: (value: Record<string, unknown>, basePath: string) => Partial<T>,
): T[] {
  assert(Array.isArray(input), `${path} must be array`);
  return input.map((binding, bindingIndex) => {
    const bindingPath = `${path}[${bindingIndex}]`;
    assert(isObject(binding), `${bindingPath} must be object`);
    assert(typeof binding.id === 'string', `${bindingPath}.id must be string`);

    const parsed: InputBinding = {
      id: binding.id,
      count: binding.count === undefined ? undefined : parseExpr(binding.count, `${bindingPath}.count`),
      all: Array.isArray(binding.all) ? binding.all.map((expr, idx) => parseExpr(expr, `${bindingPath}.all[${idx}]`)) : undefined,
      any: Array.isArray(binding.any) ? binding.any.map((expr, idx) => parseExpr(expr, `${bindingPath}.any[${idx}]`)) : undefined,
    };

    return {
      ...parsed,
      ...parseExtra(binding, bindingPath),
    } as T;
  });
}

function parseRecipe(recipe: unknown, path: string): RecipeDefinition {
  assert(isObject(recipe), `${path} must be object`);
  assert(typeof recipe.id === 'string', `${path}.id must be string`);

  const parsed: RecipeDefinition = {
    id: recipe.id,
    input: parseBindings<InputBinding>(recipe.input, `${path}.input`, () => ({})),
    output: parseBindings<OutputBinding>(recipe.output, `${path}.output`, (output, outputPath) => ({
      effects: Array.isArray(output.effects)
        ? output.effects.map((expr, idx) => parseExpr(expr, `${outputPath}.effects[${idx}]`))
        : undefined,
    })),
    effects: Array.isArray(recipe.effects) ? recipe.effects.map((expr, idx) => parseExpr(expr, `${path}.effects[${idx}]`)) : undefined,
    time: recipe.time === undefined ? undefined : parseExpr(recipe.time, `${path}.time`),
  };

  return parsed;
}

export function loadRecipes(): RecipeFile[] {
  const files = Array.isArray(rawRecipes) ? rawRecipes : [rawRecipes];
  assert(files.length > 0, 'root must be a recipe file object or array');

  return files.map((recipeFile, fileIndex) => {
    const path = `recipeFiles[${fileIndex}]`;
    assert(isObject(recipeFile), `${path} must be object`);
    assert(typeof recipeFile.action === 'string', `${path}.action must be string`);
    assert(Array.isArray(recipeFile.recipes), `${path}.recipes must be array`);

    return {
      action: recipeFile.action,
      recipes: recipeFile.recipes.map((recipe, recipeIndex) => parseRecipe(recipe, `${path}.recipes[${recipeIndex}]`)),
    };
  });
}
