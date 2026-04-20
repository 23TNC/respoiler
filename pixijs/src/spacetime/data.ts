// pixijs/src/spacetime/data.ts

export type CardId = number;
export type PlayerId = number;
export type ZoneId = number;
export type PackedPosition = number;

export interface ServerCard {
  card_id: CardId;
  definition: number;
  link: number;
  flags: number;
  zone: ZoneId;
  position: PackedPosition;
}

export interface ClientCard extends ServerCard {
  stale: boolean;
  dirty: boolean;
  selected: boolean;
  dragging: boolean;
  hidden: boolean;

  zone_q: number;
  zone_r: number;
  z: number;
  local_q: number;
  local_r: number;
  world_q: number;
  world_r: number;
}

export interface ServerPlayer {
  player_id: PlayerId;
  name: string;
  card_id: CardId;
  zone: ZoneId;
  position: PackedPosition;
}

export interface ServerAction {
  card_id: CardId;
  recipe: number;
  start: number;
  end: number;
  flags: number;
  zone: ZoneId;
  position: PackedPosition;
}

export interface ServerZone {
  zone: ZoneId;
  t_0: bigint;
  t_1: bigint;
  t_2: bigint;
  t_3: bigint;
  t_4: bigint;
  t_5: bigint;
  t_6: bigint;
  t_7: bigint;
}

export const server_cards: Record<CardId, ServerCard> = {};
export const server_players: Record<PlayerId, ServerPlayer> = {};
export const server_actions: Record<CardId, ServerAction> = {};
export const server_zones: Record<ZoneId, ServerZone> = {};

export const client_cards: Record<CardId, ClientCard> = {};

export let observer_id = 0;
export let viewed_id = 0;
export let selected_card_id = 0;

export function setObserverId(id: number): void {
  observer_id = id;
}

export function setViewedId(id: number): void {
  viewed_id = id;
}

export function setSelectedCardId(id: number): void {
  selected_card_id = id;
}

export function unpackZone(zone: number): { zone_q: number; zone_r: number; z: number } {
  const z = zone & 0xff;
  let zone_r = (zone >>> 8) & 0xfff;
  let zone_q = (zone >>> 20) & 0xfff;

  if (zone_q & 0x800) zone_q -= 0x1000;
  if (zone_r & 0x800) zone_r -= 0x1000;

  return { zone_q, zone_r, z };
}

export function unpackPosition(position: number): { local_q: number; local_r: number } {
  const local_r = position & 0x7;
  const local_q = (position >>> 3) & 0x7;
  return { local_q, local_r };
}

export function buildClientCard(server: ServerCard, previous?: ClientCard): ClientCard {
  const { zone_q, zone_r, z } = unpackZone(server.zone);
  const { local_q, local_r } = unpackPosition(server.position);

  return {
    ...server,
    stale: false,
    dirty: true,
    selected: previous?.selected ?? false,
    dragging: previous?.dragging ?? false,
    hidden: previous?.hidden ?? false,
    zone_q,
    zone_r,
    z,
    local_q,
    local_r,
    world_q: zone_q * 8 + local_q,
    world_r: zone_r * 8 + local_r,
  };
}

export function markClientCardsStale(): void {
  for (const key in client_cards) {
    client_cards[Number(key)].stale = true;
  }
}

export function syncClientCardsFromServer(): void {
  for (const key in server_cards) {
    const card_id = Number(key);
    const server = server_cards[card_id];
    const previous = client_cards[card_id];

    client_cards[card_id] = buildClientCard(server, previous);
  }

  for (const key in client_cards) {
    const card_id = Number(key);
    if (!(card_id in server_cards)) {
      delete client_cards[card_id];
    }
  }
}