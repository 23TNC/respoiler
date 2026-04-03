import { getMinInputsForVerb } from './compatibility';
import type { StagedTileAction, ValidationResult, QueuedAction } from './types';
import type { VerbDefinition } from '../world/types';

interface ValidateArgs {
  staged: StagedTileAction;
  tileExists: boolean;
  verbsById: Map<string, VerbDefinition>;
}

export function validateStagedAction(args: ValidateArgs): ValidationResult {
  const { staged, tileExists, verbsById } = args;

  if (!verbsById.has(staged.verbId)) {
    return { ok: false, error: 'Unknown verb.' };
  }

  if (!tileExists) {
    return { ok: false, error: 'Tile no longer exists.' };
  }

  if (staged.inputCardIds.length < getMinInputsForVerb(staged.verbId)) {
    return { ok: false, error: 'At least one compatible input is required.' };
  }

  const uniqueIds = new Set(staged.inputCardIds);
  if (uniqueIds.size !== staged.inputCardIds.length) {
    return { ok: false, error: 'Cannot stage the same card twice.' };
  }

  return { ok: true };
}

export function toQueuedAction(staged: StagedTileAction): QueuedAction {
  return {
    actionId: `queued-${Date.now()}`,
    characterId: staged.characterId,
    tileId: staged.tileId,
    verbId: staged.verbId,
    inputCardIds: [...staged.inputCardIds],
    repeat: staged.repeat,
    status: 'queued',
  };
}
