import type { CardDefinition } from '../cards/types';
import type { RecipeDefinition } from './types';

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

interface NormalizedRecipeInputs {
  tile: string;
  action: string;
  aspects: string[];
  items: string[];
}

function normalizeId(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeUnique(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizeId)));
}

function toList(value: string | string[] | undefined): string[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function normalizeRecipeInputs(recipe: RecipeDefinition): NormalizedRecipeInputs {
  return {
    tile: normalizeId(recipe.inputs.tile),
    action: normalizeId(recipe.inputs.action),
    aspects: normalizeUnique([...toList(recipe.inputs.aspect), ...toList(recipe.inputs.aspects)]),
    items: normalizeUnique([...toList(recipe.inputs.item), ...toList(recipe.inputs.items)]),
  };
}

function isSubsetOfRecipe(staged: NormalizedStagedCards, recipe: NormalizedRecipeInputs): boolean {
  if (staged.tile && normalizeId(staged.tile) !== recipe.tile) {
    return false;
  }

  if (staged.action && normalizeId(staged.action) !== recipe.action) {
    return false;
  }

  const stagedAspects = normalizeUnique(staged.aspects);
  if (!stagedAspects.every((aspect) => recipe.aspects.includes(aspect))) {
    return false;
  }

  const stagedItems = normalizeUnique(staged.items);
  if (!stagedItems.every((item) => recipe.items.includes(item))) {
    return false;
  }

  return true;
}

export function getMatchingRecipes(staged: NormalizedStagedCards, recipes: RecipeDefinition[]): RecipeDefinition[] {
  return recipes.filter((recipe) => isSubsetOfRecipe(staged, normalizeRecipeInputs(recipe)));
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
  recipes: RecipeDefinition[],
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
