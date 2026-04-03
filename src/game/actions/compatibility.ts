import type { CardDefinition, CardGroup } from '../cards/types';

interface VerbCompatibilityRule {
  allowedGroups: CardGroup[];
  allowedCardIds?: string[];
  minInputs: number;
}

const RULES: Record<string, VerbCompatibilityRule> = {
  work: {
    allowedGroups: ['attributes'],
    allowedCardIds: ['axe', 'skill-woodcutting'],
    minInputs: 1,
  },
  study: {
    allowedGroups: ['attributes', 'memories'],
    allowedCardIds: [],
    minInputs: 1,
  },
  attack: {
    allowedGroups: ['attributes', 'items'],
    minInputs: 1,
  },
  defend: {
    allowedGroups: ['attributes', 'items'],
    minInputs: 1,
  },
  explore: {
    allowedGroups: ['attributes', 'memories'],
    allowedCardIds: ['torch'],
    minInputs: 1,
  },
};

export function getMinInputsForVerb(verbId: string): number {
  return RULES[verbId]?.minInputs ?? 1;
}

export function getCompatibilityHint(verbId: string): string {
  const rule = RULES[verbId];
  if (!rule) {
    return 'Accepts: Compatible cards only';
  }

  const groups = rule.allowedGroups.map((group) => group[0].toUpperCase() + group.slice(1));
  const extras = (rule.allowedCardIds ?? []).map((id) => id.replace(/-/g, ' '));
  return `Accepts: ${[...groups, ...extras].join(', ')}`;
}

export function isCardCompatibleForVerb(verbId: string, card: CardDefinition): boolean {
  const rule = RULES[verbId];
  if (!rule) {
    return false;
  }

  const allowedByGroup = rule.allowedGroups.includes(card.group);
  const allowedById = (rule.allowedCardIds ?? []).includes(card.id);

  if (verbId === 'work') {
    return card.id === 'health' || card.id === 'passion' || card.id === 'reason' || allowedById;
  }

  if (verbId === 'study') {
    return card.group === 'memories' || card.id === 'passion' || card.id === 'reason';
  }

  if (verbId === 'defend') {
    return card.id === 'health' || card.id === 'reason' || card.group === 'items';
  }

  if (verbId === 'explore') {
    return card.id === 'passion' || card.id === 'reason' || card.group === 'memories' || allowedById;
  }

  return allowedByGroup || allowedById;
}
