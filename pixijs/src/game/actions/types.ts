export interface StagedTileAction {
  stagedActionId: string;
  characterId: string;
  soulId: string;
  tileId: string;
  tileInstanceId: string;
  verbCardInstanceId: string;
  inputCardInstanceIds: string[];
  repeat: boolean;
  status: 'staged' | 'queued';
  error?: string;
}

export interface QueuedAction {
  actionId: string;
  characterId: string;
  soulId: string;
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
