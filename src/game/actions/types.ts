export interface StagedTileAction {
  stagedId: string;
  characterId: string;
  tileId: string;
  tileKey: string;
  verbId: string;
  inputCardIds: string[];
  repeat: boolean;
  status: 'staged' | 'queued';
  error?: string;
}

export interface QueuedAction {
  actionId: string;
  characterId: string;
  tileId: string;
  verbId: string;
  inputCardIds: string[];
  repeat: boolean;
  status: 'queued';
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}
