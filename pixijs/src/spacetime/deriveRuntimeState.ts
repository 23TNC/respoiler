import type { CardDefinition, CardGroup, CardInstance } from '../game/cards/types';
import type { CharacterInventory, SoulModel, SoulHostedTileModel } from '../game/characters/types';
import {
  findCardDefinitionByRuntimeCardId,
  resolveCanonicalCardGroup,
  warnCardClassificationIssue,
} from '../game/cards/classification';
import { axialKey } from '../game/hex/coords';
import type { HexTile } from '../game/world/types';
import type { SpacetimeRowsSnapshot } from './client';

const EMPTY_INVENTORY: CharacterInventory = {
  techniques: [],
  essence: [],
  sundries: [],
  reveries: [],
  souls: [],
};

export interface RuntimeStageDetails {
  cardNames: string[];
  attachmentName: string | null;
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

const KNOWN_WORLD_TILE_TYPES = new Set(['campfire', 'plains', 'forest', 'water', 'ruins']);

function deriveWorldTileTypeId(rawName: string): string {
  const normalized = rawName.trim().toLowerCase().replace(/\s+/g, '-');
  return KNOWN_WORLD_TILE_TYPES.has(normalized) ? normalized : 'campfire';
}

export function isRowsSnapshotEmptyForBootstrap(rows: SpacetimeRowsSnapshot): boolean {
  return rows.souls.length === 0
    && rows.cards.length === 0
    && rows.worldTiles.length === 0
    && rows.eventTiles.length === 0
    && rows.attachments.length === 0
    && rows.stageEntries.length === 0;
}

function idToString(value: bigint | number | string): string {
  return value.toString();
}

function parseHexColor(color: string | null | undefined, fallback: number): number {
  if (!color) {
    return fallback;
  }
  return Number.parseInt(color.replace('#', ''), 16);
}

export function deriveRuntimeState(
  rows: SpacetimeRowsSnapshot,
  cardDefinitionsById?: ReadonlyMap<string, CardDefinition>,
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
    inventoryBySoulId[soul.soulId] = {
      techniques: [],
      essence: [],
      sundries: [],
      reveries: [],
      souls: [],
    };
  }

  for (const card of rows.cards) {
    const soulId = idToString(card.soulId);
    const instanceId = idToString(card.cardId);
    const cardId = card.name;
    const cardDefinition = findCardDefinitionByRuntimeCardId(cardId, cardDefinitionsById);
    const resolvedGroup = resolveCanonicalCardGroup(
      {
        instanceId,
        cardId,
        runtimeKind: card.kind as Record<string, unknown>,
      },
      cardDefinition,
    );
    if (!resolvedGroup.group) {
      warnCardClassificationIssue(
        {
          instanceId,
          cardId,
          runtimeKind: card.kind as Record<string, unknown>,
        },
        resolvedGroup.reason,
      );
      continue;
    }
    const group: CardGroup = resolvedGroup.group;

    const runtimeCardDefinition: CardDefinition = {
      id: cardId,
      name: cardDefinition?.name ?? card.name,
      group,
      backgroundColor: parseHexColor(card.bgColor ?? null, cardDefinition?.backgroundColor ?? 0x8aa3c8),
    };

    const cardInstance: CardInstance = {
      instanceId,
      cardId,
      soulId,
      linkedSoulId: card.linkedSoulId ? idToString(card.linkedSoulId) : undefined,
    };

    cardDefinitionsByInstanceId.set(instanceId, runtimeCardDefinition);
    cardInstancesById.set(instanceId, cardInstance);

    const inventory = inventoryBySoulId[soulId] ?? { ...EMPTY_INVENTORY };
    inventory[group].push(cardInstance);
    inventoryBySoulId[soulId] = inventory;
  }

  const worldTilesByAxialKey = new Map<string, HexTile>();
  for (const tile of rows.worldTiles) {
    const asHexTile: HexTile = {
      id: idToString(tile.tileId),
      q: tile.q,
      r: tile.r,
      tileType: deriveWorldTileTypeId(tile.name),
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
    list.push({
      id: idToString(eventTile.eventTileId),
      tileType: 'despair-check',
      eventLabel: eventTile.name,
      activeVerbs: [],
    });
    hostedTilesBySoulId[soulId] = list;
  }

  for (const entries of Object.values(hostedTilesBySoulId)) {
    entries.sort((a, b) => a.eventLabel.localeCompare(b.eventLabel));
  }

  const techniqueCardNameById = new Map(rows.cards.map((card) => [idToString(card.cardId), card.name]));
  const runtimeStageDetailsByTileId = new Map<string, RuntimeStageDetails>();

  for (const attachment of rows.attachments) {
    const tileId = idToString(attachment.hostId);
    const existing = runtimeStageDetailsByTileId.get(tileId) ?? { cardNames: [], attachmentName: null };
    existing.attachmentName = techniqueCardNameById.get(idToString(attachment.techniqueCardId)) ?? null;
    runtimeStageDetailsByTileId.set(tileId, existing);
  }

  for (const stage of rows.stageEntries) {
    const tileId = idToString(stage.hostId);
    const existing = runtimeStageDetailsByTileId.get(tileId) ?? { cardNames: [], attachmentName: null };
    const stagedName = techniqueCardNameById.get(idToString(stage.cardId));
    if (stagedName) {
      existing.cardNames.push(stagedName);
    }
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
