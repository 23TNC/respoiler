const DEFAULT_VOLUME = 0.35;
const DEFAULT_MIN_RETRIGGER_MS = 60;

type SoundKey = 'cardUp' | 'cardDown';

interface SoundConfig {
  src: string;
  poolSize: number;
  volume?: number;
  minRetriggerMs?: number;
}

interface SoundPool {
  players: HTMLAudioElement[];
  nextIndex: number;
  lastPlayedAtMs: number;
  minRetriggerMs: number;
}

const SOUND_CONFIG: Record<SoundKey, SoundConfig> = {
  cardUp: {
    src: '/audio/ui/card_up.ogg',
    poolSize: 3,
  },
  cardDown: {
    src: '/audio/ui/card_down.ogg',
    poolSize: 3,
  },
};

function createPool(config: SoundConfig): SoundPool {
  const players: HTMLAudioElement[] = [];
  for (let index = 0; index < config.poolSize; index += 1) {
    const audio = new Audio(config.src);
    audio.preload = 'auto';
    audio.volume = config.volume ?? DEFAULT_VOLUME;
    players.push(audio);
  }

  return {
    players,
    nextIndex: 0,
    lastPlayedAtMs: 0,
    minRetriggerMs: config.minRetriggerMs ?? DEFAULT_MIN_RETRIGGER_MS,
  };
}

class UiSoundEffects {
  private readonly pools: Record<SoundKey, SoundPool>;

  constructor() {
    this.pools = {
      cardUp: createPool(SOUND_CONFIG.cardUp),
      cardDown: createPool(SOUND_CONFIG.cardDown),
    };
  }

  play(key: SoundKey): void {
    const pool = this.pools[key];
    const now = performance.now();
    if (now - pool.lastPlayedAtMs < pool.minRetriggerMs) {
      return;
    }

    pool.lastPlayedAtMs = now;

    const audio = pool.players[pool.nextIndex];
    pool.nextIndex = (pool.nextIndex + 1) % pool.players.length;

    audio.currentTime = 0;
    void audio.play().catch(() => {
      // Ignore browser autoplay failures.
    });
  }
}

export const uiSoundEffects = new UiSoundEffects();
