import type { CardDefinition, CardGroup } from './types';

export interface RuntimeCardClassificationSource {
  instanceId: string;
  cardId: string;
  runtimeKind?: Record<string, unknown> | null;
}

export interface CardGroupResolution {
  group: CardGroup | null;
  reason: string;
}

const warnedNormalizationIssues = new Set<string>();

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function canonicalGroupFromText(value: string): CardGroup | null {
  const token = normalizeToken(value);
  if (token === 'techniques' || token === 'technique' || token === 'action') {
    return 'techniques';
  }
  if (token === 'essence' || token === 'essences' || token === 'aspect' || token === 'aspects') {
    return 'essence';
  }
  if (token === 'sundries' || token === 'sundry' || token === 'item' || token === 'items') {
    return 'sundries';
  }
  if (token === 'reveries' || token === 'reverie' || token === 'memory' || token === 'memories') {
    return 'reveries';
  }
  if (token === 'souls' || token === 'soul' || token === 'character' || token === 'characters') {
    return 'souls';
  }
  return null;
}

export function findCardDefinitionByRuntimeCardId(
  runtimeCardId: string,
  definitionsById?: ReadonlyMap<string, CardDefinition>,
): CardDefinition | undefined {
  if (!definitionsById) {
    return undefined;
  }

  const direct = definitionsById.get(runtimeCardId);
  if (direct) {
    return direct;
  }

  const normalizedRuntimeId = normalizeToken(runtimeCardId);
  if (!normalizedRuntimeId) {
    return undefined;
  }

  for (const [id, definition] of definitionsById.entries()) {
    if (normalizeToken(id) === normalizedRuntimeId) {
      return definition;
    }
  }

  return undefined;
}

export function resolveCanonicalCardGroup(
  source: RuntimeCardClassificationSource,
  cardDefinition?: CardDefinition,
): CardGroupResolution {
  if (cardDefinition) {
    return { group: cardDefinition.group, reason: 'card-definition' };
  }

  if (source.runtimeKind && typeof source.runtimeKind === 'object') {
    const runtimeKindKey = Object.keys(source.runtimeKind)[0];
    if (runtimeKindKey) {
      const groupFromRuntime = canonicalGroupFromText(runtimeKindKey);
      if (groupFromRuntime) {
        return { group: groupFromRuntime, reason: `runtime-kind:${runtimeKindKey}` };
      }
      return { group: null, reason: `unknown-runtime-kind:${runtimeKindKey}` };
    }
  }

  return { group: null, reason: 'missing-card-definition-and-runtime-kind' };
}

export function warnCardClassificationIssue(
  source: RuntimeCardClassificationSource,
  reason: string,
): void {
  const key = `${source.instanceId}|${source.cardId}|${reason}`;
  if (warnedNormalizationIssues.has(key)) {
    return;
  }
  warnedNormalizationIssues.add(key);
  console.warn('[CardClassification] Unable to classify runtime card', {
    instanceId: source.instanceId,
    cardId: source.cardId,
    reason,
    runtimeKind: source.runtimeKind ?? null,
  });
}
