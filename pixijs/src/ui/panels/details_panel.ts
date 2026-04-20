import { Text } from "pixi.js";

import {
  client_cards,
  client_cards_by_zone,
  selected_card_id,
  selected_position,
  selected_zone,
  server_zones,
  unpackPosition,
  unpackZone,
  viewed_id,
} from "../../spacetime/data";
import type { LayoutRect } from "./layout";
import { Panel } from "./panel";

interface DetailItem {
  card_type: number;
  definition_id: number;
  world_q?: number;
  world_r?: number;
  z?: number;
}

export class DetailsPanel extends Panel {
  constructor(layoutRect: LayoutRect, panelPadding: number) {
    super(layoutRect, panelPadding);
  }

  override refresh(_screenWidth: number, screenHeight: number): void {
    this.clearContent();

    const selected = this.resolveSelectedItem();
    if (!selected) {
      return;
    }

    const lines: string[] = [
      `card_type: ${selected.card_type}`,
      `definition_id: ${selected.definition_id}`,
    ];

    if (selected.card_type === 6) {
      lines.push(`q: ${selected.world_q ?? 0}`);
      lines.push(`r: ${selected.world_r ?? 0}`);
      lines.push(`z: ${selected.z ?? 0}`);

      const zoneCards = client_cards_by_zone[selected_zone];
      if (zoneCards) {
        for (const card_id of zoneCards) {
          const card = client_cards[card_id];
          if (!card) {
            continue;
          }

          if (card.position !== selected_position || card.link !== viewed_id) {
            continue;
          }

          lines.push("");
          lines.push(`card_type: ${card.card_type}`);
          lines.push(`definition_id: ${card.definition_id}`);
        }
      }
    }

    const innerRect = this.getInnerRect();
    const label = new Text({
      text: lines.join("\n"),
      style: {
        fill: 0xf4f8ff,
        fontFamily: "Segoe UI",
        fontSize: Math.max(12, Math.round(screenHeight / 70)),
        align: "left",
      },
    });

    label.x = Math.round(innerRect.x + this.panelPadding);
    label.y = Math.round(innerRect.y + this.panelPadding);
    this.content.addChild(label);
  }

  private resolveSelectedItem(): DetailItem | null {
    if (selected_card_id === 0 && selected_zone === 0 && selected_position === 0) {
      return null;
    }

    if (selected_card_id !== 0) {
      const selectedCard = client_cards[selected_card_id];
      if (!selectedCard) {
        return null;
      }

      return {
        card_type: selectedCard.card_type,
        definition_id: selectedCard.definition_id,
        world_q: selectedCard.world_q,
        world_r: selectedCard.world_r,
        z: selectedCard.z,

      };
    }

    if (selected_zone === 0) {
      return null;
    }

    const definition_id = this.decodeSelectedTileDefinitionId();
    if (definition_id === 0) {
      return null;
    }

    const { zone_q, zone_r, z } = unpackZone(selected_zone);
    const { local_q, local_r } = unpackPosition(selected_position);

    return {
      card_type: 6,
      definition_id,
      world_q: zone_q * 8 + local_q,
      world_r: zone_r * 8 + local_r,
      z,
    };
  }

  private decodeSelectedTileDefinitionId(): number {
    const zone = server_zones[selected_zone];
    if (!zone) {
      return 0;
    }

    const { local_q, local_r } = unpackPosition(selected_position);
    const columns = [zone.t_0, zone.t_1, zone.t_2, zone.t_3, zone.t_4, zone.t_5, zone.t_6, zone.t_7];
    const packedColumn = columns[local_q];
    if (packedColumn === undefined) {
      return 0;
    }

    const shifted = packedColumn >> BigInt(local_r * 8);
    return Number(shifted & 0xffn);
  }
}
