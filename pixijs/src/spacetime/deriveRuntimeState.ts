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

function idToString(value: bigint | number | string): string {
  return value.toString();
}

export function isRowsSnapshotEmptyForBootstrap(rows: SpacetimeRowsSnapshot): boolean {
  return rows.souls.length === 0
    && rows.cards.length === 0
    && rows.worldTiles.length === 0
    && rows.eventTiles.length === 0
    && rows.attachments.length === 0
    && rows.stageEntries.length === 0;
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
    inventoryBySoulId[soul.soulId] = { ...EMPTY_INVENTORY };
  }

  for (const card of rows.cards) {
    const soulId = idToString(card.soulId);
    const instanceId = idToString(card.cardId);
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

    const inventory = inventoryBySoulId[soulId] ?? { ...EMPTY_INVENTORY };
    inventory[group].push(cardInstance);
    inventoryBySoulId[soulId] = inventory;
  }

  const worldTilesByAxialKey = new Map<string, HexTile>();
  for (const tile of rows.worldTiles) {
    const tileDef = tileTypeById?.get(Number(tile.definitionId));
    if (!tileDef) {
      continue;
    }
    const asHexTile: HexTile = {
      id: idToString(tile.tileId),
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
    const tileDef = tileTypeById?.get(Number(eventTile.definitionId));
    if (!tileDef) {
      continue;
    }

    list.push({
      id: idToString(eventTile.eventTileId),
      tileType: tileDef.key,
      eventLabel: eventTile.label,
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

  for (const attachment of rows.attachments) {
    const tileId = idToString(attachment.hostId);
    const existing = runtimeStageDetailsByTileId.get(tileId) ?? { cardNames: [], attachmentName: null };
    existing.attachmentName = cardNameByInstanceId.get(idToString(attachment.techniqueCardId)) ?? null;
    runtimeStageDetailsByTileId.set(tileId, existing);
  }

  for (const stage of rows.stageEntries) {
    const tileId = idToString(stage.hostId);
    const existing = runtimeStageDetailsByTileId.get(tileId) ?? { cardNames: [], attachmentName: null };
    const stagedName = cardNameByInstanceId.get(idToString(stage.cardId));
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
