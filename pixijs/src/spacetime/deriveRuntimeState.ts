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
  cardNames: string[];
  attachmentName: string | null;
  techniqueCardInstanceId: string | null;
  status: 'staged' | 'queued';
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
  const kind = hostType && typeof hostType === 'object'
    ? Object.keys(hostType as Record<string, unknown>)[0]
    : '';
  if (kind === 'EventTile') {
    return eventTileInstanceId(hostId);
  }
  return worldTileInstanceId(hostId);
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
  return rows.souls.length === 0
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
    playerId: row.playerId?.toHexString(),
    ownerSoulId: row.ownerSoulId ? idToString(row.ownerSoulId) : undefined,
    subordinateType: row.subordinateType ? (Object.keys(row.subordinateType)[0] as SoulModel['subordinateType']) : undefined,
  }));

  const soulById = new Map(souls.map((soul) => [soul.soulId, soul]));
  const playerSoul = rows.souls.find((soul) => soul.playerId);
  const playerSoulId = playerSoul ? idToString(playerSoul.soulId) : souls[0]?.soulId ?? null;

  const inventoryBySoulId: Record<string, CharacterInventory> = {};
  const cardDefinitionsByInstanceId = new Map<string, CardDefinition>();
  const cardInstancesById = new Map<string, CardInstance>();

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

    const cardInstance: CardInstance = {
      instanceId,
      cardId,
      soulId,
      linkedSoulId: card.linkedSoulId ? idToString(card.linkedSoulId) : undefined,
    };

    cardDefinitionsByInstanceId.set(instanceId, cardDefinition);
    cardInstancesById.set(instanceId, cardInstance);

    if (reservedCardIds.has(instanceId)) {
      continue;
    }

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
    console.info('[RuntimeTiles] resolved event tile definition', {
      eventTileId: idToString(eventTile.eventTileId),
      definitionId,
      tileKey: tileDef.key,
    });

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

  const cardNameByInstanceId = new Map(
    Array.from(cardDefinitionsByInstanceId.entries()).map(([instanceId, def]) => [instanceId, def.name]),
  );
  const runtimeStageDetailsByTileId = new Map<string, RuntimeStageDetails>();

  for (const queue of rows.recipeQueues) {
    const tileId = tileHostInstanceId(queue.hostType, queue.hostId);
    const existing = runtimeStageDetailsByTileId.get(tileId) ?? {
      cardNames: [],
      attachmentName: null,
      techniqueCardInstanceId: null,
      status: 'staged' as const,
    };
    existing.status = 'queued';
    runtimeStageDetailsByTileId.set(tileId, existing);
  }

  const queuedTileIdByQueueId = new Map<string, string>(
    rows.recipeQueues.map((queue) => [idToString(queue.queueId), tileHostInstanceId(queue.hostType, queue.hostId)]),
  );
  for (const queueCard of rows.recipeQueueCards) {
    const tileId = queuedTileIdByQueueId.get(idToString(queueCard.queueId));
    if (!tileId) {
      continue;
    }
    const existing = runtimeStageDetailsByTileId.get(tileId) ?? {
      cardNames: [],
      attachmentName: null,
      techniqueCardInstanceId: null,
      status: 'staged' as const,
    };
    const cardName = cardNameByInstanceId.get(idToString(queueCard.cardId));
    if (cardName) {
      existing.cardNames.push(cardName);
    }
    runtimeStageDetailsByTileId.set(tileId, existing);
  }

  for (const attachment of rows.attachments) {
    const tileId = tileHostInstanceId(attachment.hostType, attachment.hostId);
    const existing = runtimeStageDetailsByTileId.get(tileId) ?? {
      cardNames: [],
      attachmentName: null,
      techniqueCardInstanceId: null,
      status: 'staged' as const,
    };
    existing.techniqueCardInstanceId = idToString(attachment.techniqueCardId);
    existing.attachmentName = cardNameByInstanceId.get(existing.techniqueCardInstanceId) ?? null;
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
