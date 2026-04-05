import type { CardDefinition, CardGroup } from './types';

export interface RuntimeCardClassificationSource {
  instanceId: string;
  cardDefinitionId: number;
  runtimeKind?: Record<string, unknown> | null;
}

export interface CardGroupResolution {
  group: CardGroup | null;
  reason: string;
}

const warnedNormalizationIssues = new Set<string>();

function canonicalGroupFromText(value: string): CardGroup | null {
  const token = value.trim().toLowerCase();
  if (token === 'technique') return 'techniques';
  if (token === 'essence') return 'essence';
  if (token === 'sundries') return 'sundries';
  if (token === 'reveries') return 'reveries';
  if (token === 'soul') return 'souls';
  return null;
}

export function findCardDefinitionByRuntimeCardId(
  runtimeCardId: number,
  definitionsById?: ReadonlyMap<number, CardDefinition>,
): CardDefinition | undefined {
  return definitionsById?.get(runtimeCardId);
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
    }
  }

  return { group: null, reason: 'missing-card-definition' };
}

export function warnCardClassificationIssue(
  source: RuntimeCardClassificationSource,
  reason: string,
): void {
  const key = `${source.instanceId}|${source.cardDefinitionId}|${reason}`;
  if (warnedNormalizationIssues.has(key)) {
    return;
  }
  warnedNormalizationIssues.add(key);
  console.warn('[CardClassification] Unable to classify runtime card', {
    instanceId: source.instanceId,
    cardDefinitionId: source.cardDefinitionId,
    reason,
    runtimeKind: source.runtimeKind ?? null,
  });
}
