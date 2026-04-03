export type RecipeConditionType = 'tile' | 'action' | 'aspect' | 'character' | 'item' | 'random';

export type RecipeOp = 'eq' | 'ge' | 'le' | 'gt' | 'lt';

export type RecipeValue = number | string | boolean;

export interface RecipeCondition {
  type: RecipeConditionType;
  id?: string;
  op: RecipeOp;
  value: RecipeValue;
}

export interface RecipeEffect {
  type: Exclude<RecipeConditionType, 'random' | 'item'>;
  id?: string;
  op: RecipeOp;
  value: RecipeValue;
}

export interface RecipeOutput {
  id: string;
  amount: number;
  conditions?: RecipeCondition[];
  effects?: RecipeEffect[];
}

export interface RecipeInputs {
  tile: string;
  action: string;
  aspect: string;
}

export interface RecipeDefinition {
  inputs: RecipeInputs;
  outputs: RecipeOutput[];
}

export type RecipeValueBag = Record<string, RecipeValue>;

export interface RecipeEvaluationContext {
  tile: {
    id: string;
    attributes?: RecipeValueBag;
  };
  action: {
    id: string;
    attributes?: RecipeValueBag;
  };
  aspect: {
    id: string;
    attributes?: RecipeValueBag;
  };
  character?: {
    id: string;
    attributes?: RecipeValueBag;
  };
  items?: RecipeValueBag;
  recipes: RecipeDefinition[];
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
  outputIndex: number;
  effectIndex: number;
  effect: RecipeEffect;
}

export interface AppliedEffect {
  type: RecipeEffect['type'];
  id?: string;
  op: 'eq' | 'ge' | 'le';
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
  finalState: {
    tile: RecipeValueBag;
    action: RecipeValueBag;
    aspect: RecipeValueBag;
    character: RecipeValueBag;
    items: RecipeValueBag;
  };
}
