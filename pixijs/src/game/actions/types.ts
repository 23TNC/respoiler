export interface StagedTileAction {
  stagedActionId: string;
  characterId: string;
  soulId: string;
  tileId: string;
  tileInstanceId: string;
  verbCardInstanceId: string;
  inputCardInstanceIds: string[];
  queuedVerbLabel?: string;
  queuedInputCardNames?: string[];
  repeat: boolean;
  status: 'staged' | 'queued' | 'running';
  error?: string;
}

export interface DisplayTileAction {
  tileInstanceId: string;
  soulId: string | null;
  source: 'local' | 'runtime';
  status: 'staged' | 'queued' | 'running';
  techniqueInstanceId: string | null;
  techniqueName: string | null;
  techniqueColor: number | null;
  inputInstanceIds: string[];
  inputNames: string[];
  repeat: boolean;
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
