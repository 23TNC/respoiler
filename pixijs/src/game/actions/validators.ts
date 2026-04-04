import { getMinInputsForVerb } from './compatibility';
import type { StagedTileAction, ValidationResult, QueuedAction } from './types';
import type { CardDefinition } from '../cards/types';

interface ValidateArgs {
  staged: StagedTileAction;
  tileExists: boolean;
  getCardDefinitionByInstanceId: (instanceId: string) => CardDefinition | undefined;
}

export function validateStagedAction(args: ValidateArgs): ValidationResult {
  const { staged, tileExists, getCardDefinitionByInstanceId } = args;

  const verbCard = getCardDefinitionByInstanceId(staged.verbCardInstanceId);
  if (!verbCard || verbCard.group !== 'techniques') {
    return { ok: false, error: 'Unknown or invalid verb card.' };
  }

  if (!tileExists) {
    return { ok: false, error: 'Tile no longer exists.' };
  }

  if (staged.inputCardInstanceIds.length < getMinInputsForVerb(verbCard.id)) {
    return { ok: false, error: 'At least one compatible input is required.' };
  }

  const uniqueIds = new Set(staged.inputCardInstanceIds);
  if (uniqueIds.size !== staged.inputCardInstanceIds.length) {
    return { ok: false, error: 'Cannot stage the same card twice.' };
  }

  return { ok: true };
}

export function toQueuedAction(staged: StagedTileAction): QueuedAction {
  return {
    actionId: `queued-${Date.now()}`,
    characterId: staged.characterId,
    soulId: staged.soulId,
    tileId: staged.tileId,
    verbCardInstanceId: staged.verbCardInstanceId,
    inputCardInstanceIds: [...staged.inputCardInstanceIds],
    repeat: staged.repeat,
    status: 'queued',
  };
}
