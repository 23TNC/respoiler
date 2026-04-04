export type RecipePrimitive = string | number;

export type RecipeValue = string | number | boolean;

export type RecipeValueBag = Record<string, RecipeValue>;

export type RecipeOp =
  | 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge'
  | 'add' | 'sub' | 'mul' | 'div'
  | 'input_val' | 'input_ref' | 'output_ref'
  | 'rand' | 'max' | 'hex_dist' | 'select_one'
  | 'apply_eq' | 'apply_le' | 'apply_ge'
  | 'apply_add' | 'apply_sub' | 'apply_mul' | 'apply_div';

export type RecipeExpr =
  | { value: RecipePrimitive }
  | { lhs: RecipeExpr; op: RecipeOp; rhs?: RecipeExpr };

export interface InputBinding {
  id: string;
  count?: RecipeExpr;
  all?: RecipeExpr[];
  any?: RecipeExpr[];
}

export interface OutputBinding {
  id: string;
  count?: RecipeExpr;
  all?: RecipeExpr[];
  any?: RecipeExpr[];
  effects?: RecipeExpr[];
}

export interface RecipeDefinition {
  id: string;
  input: InputBinding[];
  output: OutputBinding[];
  effects?: RecipeExpr[];
  time?: RecipeExpr;
}

export interface RecipeFile {
  action: string;
  recipes: RecipeDefinition[];
}

export interface RecipeEvaluationContext {
  action: string;
  entities: Record<string, RecipeValueBag | undefined>;
  recipes: RecipeFile[];
  random?: () => number;
}

export interface ProducedOutput {
  recipeIndex: number;
  outputIndex: number;
  id: string;
  amount: number;
}

export interface QueuedEffect {
  recipeIndex: number;
  outputIndex: number | null;
  effectIndex: number;
  effect: RecipeExpr;
}

export interface AppliedEffect {
  ref: string;
  op: Extract<RecipeOp, `apply_${string}`>;
  value: RecipeValue;
}

export interface OutputEvaluationTrace {
  outputIndex: number;
  matched: boolean;
  failedConditionIndexes: number[];
}

export interface RecipeEvaluationTrace {
  recipeIndex: number;
  inputMatched: boolean;
  outputResults: OutputEvaluationTrace[];
}

export interface EvaluationResult {
  producedOutputs: ProducedOutput[];
  queuedEffects: QueuedEffect[];
  appliedEffects: AppliedEffect[];
  traces: RecipeEvaluationTrace[];
  finalState: Record<string, RecipeValueBag>;
}
