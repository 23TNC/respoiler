import type { CardDefinition, CardGroup } from '../cards/types';

interface VerbCompatibilityRule {
  allowedGroups: CardGroup[];
  allowedCardIds?: string[];
  minInputs: number;
}

const RULES: Record<string, VerbCompatibilityRule> = {
  work: {
    allowedGroups: ['essence'],
    allowedCardIds: ['axe', 'skill-woodcutting'],
    minInputs: 1,
  },
  study: {
    allowedGroups: ['essence', 'reveries'],
    allowedCardIds: [],
    minInputs: 1,
  },
  attack: {
    allowedGroups: ['essence', 'sundries'],
    minInputs: 1,
  },
  defend: {
    allowedGroups: ['essence', 'sundries'],
    minInputs: 1,
  },
  explore: {
    allowedGroups: ['essence', 'reveries'],
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
  const allowedById = (rule.allowedCardIds ?? []).includes(card.key);

  if (verbId === 'work') {
    return card.key === 'health' || card.key === 'passion' || card.key === 'reason' || allowedById;
  }

  if (verbId === 'study') {
    return card.group === 'reveries' || card.key === 'passion' || card.key === 'reason';
  }

  if (verbId === 'defend') {
    return card.key === 'health' || card.key === 'reason' || card.group === 'sundries';
  }

  if (verbId === 'explore') {
    return card.key === 'passion' || card.key === 'reason' || card.group === 'reveries' || allowedById;
  }

  return allowedByGroup || allowedById;
}
