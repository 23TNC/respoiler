import type { CardDefinition } from '../cards/types';
import type { RecipeDefinition, RecipeFile } from './types';

export interface NormalizedStagedCards {
  tileId: number | null;
  actionCardId: number | null;
  aspects: number[];
  sundries: number[];
}

export type RecipeCardCategory = 'action' | 'aspect' | 'item';

export interface StageCandidateCard {
  category: RecipeCardCategory;
  id: number;
}

function unique(values: number[]): number[] {
  return Array.from(new Set(values));
}

function recipeSupportsStagedInputs(staged: NormalizedStagedCards, recipe: RecipeDefinition): boolean {
  const availableIds = new Set(recipe.input.map((binding) => binding.id));

  if (staged.tileId !== null && !availableIds.has(staged.tileId)) {
    return false;
  }

  const stagedAspects = unique(staged.aspects);
  if (!stagedAspects.every((aspect) => availableIds.has(aspect))) {
    return false;
  }

  const stagedSundries = unique(staged.sundries);
  if (!stagedSundries.every((item) => availableIds.has(item))) {
    return false;
  }

  return true;
}

function getActionRecipes(actionCardId: number | null, recipes: RecipeFile[]): RecipeDefinition[] {
  if (actionCardId === null) {
    return [];
  }
  return recipes
    .filter((file) => file.actionCardId === actionCardId)
    .flatMap((file) => file.recipes);
}

export function getMatchingRecipes(staged: NormalizedStagedCards, recipes: RecipeFile[]): RecipeDefinition[] {
  const actionRecipes = getActionRecipes(staged.actionCardId, recipes);
  return actionRecipes.filter((recipe) => recipeSupportsStagedInputs(staged, recipe));
}

function applyCandidate(staged: NormalizedStagedCards, candidate: StageCandidateCard): NormalizedStagedCards | null {
  if (candidate.category === 'action') {
    if (staged.actionCardId !== null && staged.actionCardId !== candidate.id) {
      return null;
    }
    return { ...staged, actionCardId: candidate.id };
  }

  if (candidate.category === 'aspect') {
    const stagedAspects = unique(staged.aspects);
    if (stagedAspects.includes(candidate.id)) {
      return null;
    }
    return { ...staged, aspects: [...stagedAspects, candidate.id] };
  }

  const stagedSundries = unique(staged.sundries);
  if (stagedSundries.includes(candidate.id)) {
    return null;
  }
  return { ...staged, sundries: [...stagedSundries, candidate.id] };
}

export function canStageCard(
  staged: NormalizedStagedCards,
  candidate: StageCandidateCard,
  recipes: RecipeFile[],
): boolean {
  const next = applyCandidate(staged, candidate);
  if (!next) {
    return false;
  }
  return getMatchingRecipes(next, recipes).length > 0;
}

export function getRecipeCardCategory(card: CardDefinition): RecipeCardCategory | null {
  if (card.group === 'techniques') {
    return 'action';
  }
  if (card.group === 'essence') {
    return 'aspect';
  }
  if (card.group === 'sundries') {
    return 'item';
  }
  return null;
}
