export interface StagedTileAction {
  stagedActionId: string;
  characterId: string;
  tileId: string;
  tileKey: string;
  verbCardInstanceId: string;
  inputCardInstanceIds: string[];
  repeat: boolean;
  status: 'staged' | 'queued';
  error?: string;
}

export interface QueuedAction {
  actionId: string;
  characterId: string;
  tileId: string;
  verbCardInstanceId: string;
  inputCardInstanceIds: string[];
  repeat: boolean;
  status: 'queued';
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}
