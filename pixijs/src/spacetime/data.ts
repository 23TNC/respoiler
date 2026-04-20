// pixijs/src/spacetime/data.ts

export type CardId = number;
export type PlayerId = number;
export type ZoneId = number;
export type PackedPosition = number;

export interface DefinitionStyle {
  color?: Array<number | string>;
}

export interface CardDefinition {
  name?: string;
  style?: DefinitionStyle;
}

export interface ServerCard {
  card_id: CardId;
  definition: number;
  link: number;
  flags: number;
  zone: ZoneId;
  position: PackedPosition;
}

export interface ClientCard extends ServerCard {
  card_type: number;
  definition_id: number;
  colors: number[];

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
export const client_cards_by_zone: Record<ZoneId, Set<CardId>> = {};
export const card_definitions: Record<number, CardDefinition> = {};

export let observer_id = 0;
export let viewed_id = 0;
export let selected_card_id = 0;
export let selected_zone = 0;
export let selected_position = 0;

export function setViewedId(id: number): void {
  viewed_id = id;
}

export function setObserverId(id: number): void {
  observer_id = id;
}

export function setSelectedCardId(id: number): void {
  selected_card_id = id;
}

export function setSelectedZone(zone: number): void {
  selected_zone = zone;
}

export function setSelectedPosition(position: number): void {
  selected_position = position;
}

export function setSelectedState(card_id: number, zone: number, position: number): void {
  selected_card_id = card_id;
  selected_zone = zone;
  selected_position = position;
}

export function clearSelectedState(): void {
  selected_card_id = 0;
  selected_zone = 0;
  selected_position = 0;
}

export function decodeCardType(definition: number): number {
  return (definition >>> 12) & 0x000f;
}

export function decodeDefinitionId(definition: number): number {
  return definition & 0x0fff;
}

export function packDefinition(card_type: number, definition_id: number): number {
  return (((card_type & 0x0f) << 12) | (definition_id & 0x0fff)) >>> 0;
}

export function upsertCardDefinition(definition: number, entry: CardDefinition): void {
  card_definitions[definition] = entry;
}

export function clearCardDefinitions(): void {
  for (const key in card_definitions) {
    delete card_definitions[Number(key)];
  }
}

export function getCardDefinition(definition: number): CardDefinition | undefined {
  return card_definitions[definition];
}

export function packZone(zone_q: number, zone_r: number, z: number): number {
  // normalize to 12-bit signed
  const q = zone_q & 0xfff;
  const r = zone_r & 0xfff;

  return ((q << 20) | (r << 8) | (z & 0xff)) >>> 0;
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

export function packPosition(local_q: number, local_r: number): number {
  return ((local_q & 0x7) << 3) | (local_r & 0x7);
}

function addClientCardToZone(card: ClientCard): void {
  if (!client_cards_by_zone[card.zone]) {
    client_cards_by_zone[card.zone] = new Set<CardId>();
  }

  client_cards_by_zone[card.zone].add(card.card_id);
}

function removeClientCardFromZone(zone: ZoneId, card_id: CardId): void {
  const zone_cards = client_cards_by_zone[zone];
  if (!zone_cards) return;

  zone_cards.delete(card_id);

  if (zone_cards.size === 0) {
    delete client_cards_by_zone[zone];
  }
}

export function buildClientCard(server: ServerCard, previous?: ClientCard): ClientCard {
  const { zone_q, zone_r, z } = unpackZone(server.zone);
  const { local_q, local_r } = unpackPosition(server.position);

  const card_type = decodeCardType(server.definition);
  const definition_id = decodeDefinitionId(server.definition);
  const definition = getCardDefinition(server.definition);
  const colors = normalizeCardColors(definition?.style?.color);

  if (card_type >= 1 && card_type <= 5 && colors[2] == null) {
    colors[2] = 0x0b1a2a;
  }

  return {
    ...server,
    card_type,
    definition_id,
    colors,

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

function normalizeCardColors(colors: Array<number | string> | undefined): number[] {
  if (!colors) {
    return [];
  }

  const normalized: number[] = [];
  for (const rawColor of colors) {
    const parsedColor = parseColorNumber(rawColor);
    if (parsedColor != null) {
      normalized.push(parsedColor);
    }
  }

  return normalized;
}

function parseColorNumber(rawColor: number | string): number | null {
  if (typeof rawColor === "number") {
    return rawColor;
  }

  const normalizedHex = rawColor.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalizedHex)) {
    return null;
  }

  return Number.parseInt(normalizedHex, 16);
}

export function markClientCardsStale(): void {
  for (const key in client_cards) {
    client_cards[Number(key)].stale = true;
  }
}

export function upsertClientCard(server: ServerCard): void {
  const previous = client_cards[server.card_id];
  const next = buildClientCard(server, previous);

  if (previous && previous.zone !== next.zone) {
    removeClientCardFromZone(previous.zone, server.card_id);
  }

  client_cards[server.card_id] = next;
  addClientCardToZone(next);
}

export function removeClientCard(card_id: CardId): void {
  const previous = client_cards[card_id];
  if (!previous) return;

  removeClientCardFromZone(previous.zone, card_id);
  delete client_cards[card_id];
}

export function syncClientCardsFromServer(): void {
  for (const key in server_cards) {
    upsertClientCard(server_cards[Number(key)]);
  }

  for (const key in client_cards) {
    const card_id = Number(key);
    if (!(card_id in server_cards)) {
      removeClientCard(card_id);
    }
  }
}
