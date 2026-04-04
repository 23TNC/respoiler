import type { CardDefinition } from '../cards/types';
import type { RecipeDefinition, RecipeFile } from './types';

export interface NormalizedStagedCards {
  tile: string | null;
  action: string | null;
  aspects: string[];
  items: string[];
}

export type RecipeCardCategory = 'action' | 'aspect' | 'item';

export interface StageCandidateCard {
  category: RecipeCardCategory;
  id: string;
}

function normalizeId(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeUnique(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizeId)));
}

function recipeSupportsStagedInputs(staged: NormalizedStagedCards, recipe: RecipeDefinition): boolean {
  const availableIds = new Set(recipe.input.map((binding) => normalizeId(binding.id)));

  if (staged.tile && !availableIds.has(normalizeId(staged.tile))) {
    return false;
  }

  const stagedAspects = normalizeUnique(staged.aspects);
  if (!stagedAspects.every((aspect) => availableIds.has(aspect))) {
    return false;
  }

  const stagedItems = normalizeUnique(staged.items);
  if (!stagedItems.every((item) => availableIds.has(item))) {
    return false;
  }

  return true;
}

function getActionRecipes(actionId: string | null, recipes: RecipeFile[]): RecipeDefinition[] {
  if (!actionId) {
    return [];
  }
  const action = normalizeId(actionId);
  return recipes
    .filter((file) => normalizeId(file.action) === action)
    .flatMap((file) => file.recipes);
}

export function getMatchingRecipes(staged: NormalizedStagedCards, recipes: RecipeFile[]): RecipeDefinition[] {
  const actionRecipes = getActionRecipes(staged.action, recipes);
  return actionRecipes.filter((recipe) => recipeSupportsStagedInputs(staged, recipe));
}

function applyCandidate(staged: NormalizedStagedCards, candidate: StageCandidateCard): NormalizedStagedCards | null {
  const candidateId = normalizeId(candidate.id);

  if (candidate.category === 'action') {
    if (staged.action && normalizeId(staged.action) !== candidateId) {
      return null;
    }
    return { ...staged, action: candidateId };
  }

  if (candidate.category === 'aspect') {
    const stagedAspects = normalizeUnique(staged.aspects);
    if (stagedAspects.includes(candidateId)) {
      return null;
    }
    return { ...staged, aspects: [...stagedAspects, candidateId] };
  }

  const stagedItems = normalizeUnique(staged.items);
  if (stagedItems.includes(candidateId)) {
    return null;
  }
  return { ...staged, items: [...stagedItems, candidateId] };
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
  if (card.group === 'actions') {
    return 'action';
  }
  if (card.group === 'attributes') {
    return 'aspect';
  }
  if (card.group === 'items') {
    return 'item';
  }
  return null;
}
