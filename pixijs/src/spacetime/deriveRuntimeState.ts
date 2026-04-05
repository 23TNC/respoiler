import type { CardDefinition, CardGroup, CardInstance } from '../game/cards/types';
import type { CharacterInventory, SoulModel, SoulHostedTileModel } from '../game/characters/types';
import {
  findCardDefinitionByRuntimeCardId,
  resolveCanonicalCardGroup,
  warnCardClassificationIssue,
} from '../game/cards/classification';
import { axialKey } from '../game/hex/coords';
import type { HexTile, TileTypeDefinition } from '../game/world/types';
import type { SpacetimeRowsSnapshot } from './client';

function createEmptyInventory(): CharacterInventory {
  return {
    techniques: [],
    essence: [],
    sundries: [],
    reveries: [],
    souls: [],
  };
}

export interface RuntimeStageDetails {
  hostSoulId: string | null;
  techniqueCardInstanceId: string | null;
  techniqueCardDefinitionId: number | null;
  techniqueCardKey: string | null;
  techniqueCardName: string | null;
  techniqueCardColor: number | null;
  cardNames: string[];
  cardInstanceIds: string[];
  attachmentName: string | null;
  status: 'staged' | 'queued' | 'running';
}

export interface RuntimeDerivedState {
  souls: SoulModel[];
  soulById: Map<string, SoulModel>;
  playerSoulId: string | null;
  inventoryBySoulId: Record<string, CharacterInventory>;
  worldTilesByAxialKey: Map<string, HexTile>;
  hostedTilesBySoulId: Record<string, SoulHostedTileModel[]>;
  cardDefinitionsByInstanceId: Map<string, CardDefinition>;
  cardInstancesById: Map<string, CardInstance>;
  runtimeStageDetailsByTileId: Map<string, RuntimeStageDetails>;
}

function idToString(value: bigint | number | string): string {
  return value.toString();
}

function worldTileInstanceId(rawId: bigint | number | string): string {
  return `world:${idToString(rawId)}`;
}

function eventTileInstanceId(rawId: bigint | number | string): string {
  return `event:${idToString(rawId)}`;
}

function tileHostInstanceId(hostType: unknown, hostId: bigint | number | string): string {
  const kind = normalizeEnumTag(hostType);
  if (kind === 'EventTile') {
    return eventTileInstanceId(hostId);
  }
  return worldTileInstanceId(hostId);
}

function normalizeEnumTag(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.tag === 'string') {
      return record.tag;
    }
    return Object.keys(record)[0] ?? '';
  }
  return '';
}

function normalizeQueueStatus(value: unknown): RuntimeStageDetails['status'] | null {
  const normalized = normalizeEnumTag(value).toLowerCase();
  if (normalized === 'queued') {
    return 'queued';
  }
  if (normalized === 'running') {
    return 'running';
  }
  return null;
}

function resolveTileDefinition(
  tileTypeById: ReadonlyMap<number, TileTypeDefinition> | undefined,
  definitionId: number,
  context: 'world' | 'event',
): TileTypeDefinition | undefined {
  const tileDef = tileTypeById?.get(definitionId);
  if (!tileDef && context === 'event') {
    console.warn('[RuntimeTiles] missing event tile definition', { definitionId });
  }
  return tileDef;
}

export function isRowsSnapshotEmptyForBootstrap(rows: SpacetimeRowsSnapshot): boolean {
  return rows.players.length === 0
    && rows.souls.length === 0
    && rows.cards.length === 0
    && rows.worldTiles.length === 0
    && rows.eventTiles.length === 0
    && rows.attachments.length === 0
    && rows.recipeQueues.length === 0
    && rows.recipeQueueCards.length === 0
    && rows.cardReservations.length === 0;
}

export function deriveRuntimeState(
  rows: SpacetimeRowsSnapshot,
  cardDefinitionsById?: ReadonlyMap<number, CardDefinition>,
  tileTypeById?: ReadonlyMap<number, TileTypeDefinition>,
): RuntimeDerivedState {
  const souls = rows.souls.map((row) => ({
    soulId: idToString(row.soulId),
    name: row.name,
    playerId: row.playerId ? idToString(row.playerId) : undefined,
    ownerSoulId: row.ownerSoulId ? idToString(row.ownerSoulId) : undefined,
    subordinateType: row.subordinateType ? (Object.keys(row.subordinateType)[0] as SoulModel['subordinateType']) : undefined,
  }));

  const soulById = new Map(souls.map((soul) => [soul.soulId, soul]));
  const playerSoul = rows.activePlayerId
    ? rows.souls.find((soul) => soul.playerId?.toString() === rows.activePlayerId)
    : rows.souls.find((soul) => soul.playerId);
  const playerSoulId = playerSoul ? idToString(playerSoul.soulId) : souls[0]?.soulId ?? null;

  const inventoryBySoulId: Record<string, CharacterInventory> = {};
  const cardDefinitionsByInstanceId = new Map<string, CardDefinition>();
  const cardInstancesById = new Map<string, CardInstance>();
  const cardDefinitionByInstanceId = new Map<string, CardDefinition | undefined>();
  const cardNameByInstanceId = new Map<string, string>();
  const cardGroupByInstanceId = new Map<string, CardGroup | null>();

  for (const soul of souls) {
    inventoryBySoulId[soul.soulId] = createEmptyInventory();
  }

  const reservedCardIds = new Set(rows.cardReservations.map((reservation) => idToString(reservation.cardId)));

  for (const card of rows.cards) {
    const instanceId = idToString(card.cardId);
    const soulId = idToString(card.soulId);
    const cardId = Number(card.definitionId);
    const cardDefinition = findCardDefinitionByRuntimeCardId(cardId, cardDefinitionsById);
    const resolvedGroup = resolveCanonicalCardGroup(
      {
        instanceId,
        cardDefinitionId: cardId,
      },
      cardDefinition,
    );

    const cardInstance: CardInstance = {
      instanceId,
      cardId,
      soulId,
      linkedSoulId: card.linkedSoulId ? idToString(card.linkedSoulId) : undefined,
    };

    cardInstancesById.set(instanceId, cardInstance);
    cardDefinitionByInstanceId.set(instanceId, cardDefinition);
    cardNameByInstanceId.set(instanceId, cardDefinition?.name ?? instanceId);
    cardGroupByInstanceId.set(instanceId, resolvedGroup.group);
    if (cardDefinition) {
      cardDefinitionsByInstanceId.set(instanceId, cardDefinition);
    }

    if (reservedCardIds.has(instanceId)) {
      continue;
    }

    if (!resolvedGroup.group || !cardDefinition) {
      warnCardClassificationIssue(
        {
          instanceId,
          cardDefinitionId: cardId,
        },
        resolvedGroup.reason,
      );
      continue;
    }
    const group: CardGroup = resolvedGroup.group;

    const inventory = inventoryBySoulId[soulId] ?? createEmptyInventory();
    inventory[group].push(cardInstance);
    inventoryBySoulId[soulId] = inventory;
  }

  const worldTilesByAxialKey = new Map<string, HexTile>();
  for (const tile of rows.worldTiles) {
    const tileDef = resolveTileDefinition(tileTypeById, Number(tile.definitionId), 'world');
    if (!tileDef) {
      continue;
    }
    const asHexTile: HexTile = {
      id: worldTileInstanceId(tile.tileId),
      q: tile.q,
      r: tile.r,
      tileType: tileDef.key,
      improvement: null,
      visibleSides: ['N', 'NE', 'SE', 'S', 'SW', 'NW'],
      hiddenPresenceCount: 0,
      activeVerbs: [],
      selected: false,
      discovered: true,
    };
    worldTilesByAxialKey.set(axialKey({ q: tile.q, r: tile.r }), asHexTile);
  }

  const hostedTilesBySoulId: Record<string, SoulHostedTileModel[]> = {};
  for (const eventTile of rows.eventTiles) {
    const soulId = idToString(eventTile.soulId);
    const list = hostedTilesBySoulId[soulId] ?? [];
    const definitionId = Number(eventTile.definitionId);
    const tileDef = resolveTileDefinition(tileTypeById, definitionId, 'event');
    if (!tileDef) {
      continue;
    }

    list.push({
      id: eventTileInstanceId(eventTile.eventTileId),
      tileType: tileDef.key,
      eventLabel: tileDef.name,
      activeVerbs: [],
    });
    hostedTilesBySoulId[soulId] = list;
  }

  for (const entries of Object.values(hostedTilesBySoulId)) {
    entries.sort((a, b) => a.eventLabel.localeCompare(b.eventLabel));
  }

  const eventTileSoulIdByHostId = new Map(
    rows.eventTiles.map((eventTile) => [idToString(eventTile.eventTileId), idToString(eventTile.soulId)] as const),
  );
  const runtimeStageDetailsByTileId = new Map<string, RuntimeStageDetails>();

  for (const attachment of rows.attachments) {
    const tileId = tileHostInstanceId(attachment.hostType, attachment.hostId);
    const existing = runtimeStageDetailsByTileId.get(tileId) ?? {
      hostSoulId: normalizeEnumTag(attachment.hostType) === 'EventTile'
        ? eventTileSoulIdByHostId.get(idToString(attachment.hostId)) ?? idToString(attachment.soulId)
        : null,
      techniqueCardInstanceId: null,
      techniqueCardDefinitionId: null,
      techniqueCardKey: null,
      techniqueCardName: null,
      techniqueCardColor: null,
      cardNames: [],
      cardInstanceIds: [],
      attachmentName: null,
      status: 'staged' as const,
    };
    const techniqueCardInstanceId = idToString(attachment.techniqueCardId);
    const techniqueCardDefinition = cardDefinitionByInstanceId.get(techniqueCardInstanceId);
    const techniqueCardName = techniqueCardDefinition?.name ?? cardNameByInstanceId.get(techniqueCardInstanceId) ?? techniqueCardInstanceId;

    existing.techniqueCardInstanceId = techniqueCardInstanceId;
    existing.techniqueCardDefinitionId = techniqueCardDefinition?.id ?? null;
    existing.techniqueCardKey = techniqueCardDefinition?.key ?? null;
    existing.techniqueCardName = techniqueCardName;
    existing.techniqueCardColor = techniqueCardDefinition?.backgroundColor ?? null;
    existing.attachmentName = techniqueCardName;
    runtimeStageDetailsByTileId.set(tileId, existing);
  }

  const queueCardIdsByQueueId = new Map<string, string[]>();
  for (const queueCard of rows.recipeQueueCards) {
    const queueId = idToString(queueCard.queueId);
    const list = queueCardIdsByQueueId.get(queueId) ?? [];
    list.push(idToString(queueCard.cardId));
    queueCardIdsByQueueId.set(queueId, list);
  }

  for (const queue of rows.recipeQueues) {
    const runtimeStatus = normalizeQueueStatus(queue.state);
    if (!runtimeStatus) {
      continue;
    }

    const tileId = tileHostInstanceId(queue.hostType, queue.hostId);
    const existing = runtimeStageDetailsByTileId.get(tileId) ?? {
      hostSoulId: normalizeEnumTag(queue.hostType) === 'EventTile'
        ? eventTileSoulIdByHostId.get(idToString(queue.hostId)) ?? idToString(queue.actorSoulId)
        : null,
      techniqueCardInstanceId: null,
      techniqueCardDefinitionId: null,
      techniqueCardKey: null,
      techniqueCardName: null,
      techniqueCardColor: null,
      cardNames: [],
      cardInstanceIds: [],
      attachmentName: null,
      status: 'staged' as const,
    };
    const queueCardIds = queueCardIdsByQueueId.get(idToString(queue.queueId)) ?? [];
    const queuedInputCardIds = queueCardIds.filter((cardId) => (
      cardId !== existing.techniqueCardInstanceId
      && cardGroupByInstanceId.get(cardId) !== 'techniques'
    ));
    existing.cardInstanceIds = queuedInputCardIds;
    existing.cardNames = queuedInputCardIds.map((cardId) => cardNameByInstanceId.get(cardId) ?? cardId);
    existing.status = runtimeStatus;
    runtimeStageDetailsByTileId.set(tileId, existing);
  }

  return {
    souls,
    soulById,
    playerSoulId,
    inventoryBySoulId,
    worldTilesByAxialKey,
    hostedTilesBySoulId,
    cardDefinitionsByInstanceId,
    cardInstancesById,
    runtimeStageDetailsByTileId,
  };
}
