import {
  client_cards,
  packPosition,
  setSelectedState,
  updateClientCardLocation,
} from "../../spacetime/data";
import type { InputAction, InputContext } from "./types";

interface InteractionResolverOptions {
  onStateChanged?: () => void;
}

export class InteractionResolver {
  private readonly onStateChanged?: () => void;

  constructor(options: InteractionResolverOptions = {}) {
    this.onStateChanged = options.onStateChanged;
  }

  resolve(action: InputAction, context: InputContext): void {
    switch (action) {
      case "left_mouse_down":
      case "left_mouse_up":
        return;
      case "left_mouse_start_drag":
        this.handleLeftMouseStartDrag(context);
        return;
      case "left_mouse_stop_drag":
        this.handleLeftMouseStopDrag(context);
        return;
      case "left_mouse_click":
        this.handleLeftMouseClick(context);
        return;
      default:
        return;
    }
  }

  private handleLeftMouseClick(context: InputContext): void {
    const target = context.sourceEntity;
    if (!target) {
      return;
    }
    if (target.type === "card" && typeof target.id === "number") {
      
      this.selectSingleCard(target.id);
      return;
    }

    if (target.type === "tile" && typeof target.id === "string") {
      this.selectSingleTile(target.id);
    }
  }

  private handleLeftMouseStartDrag(context: InputContext): void {
    const source = context.sourceEntity;
    if (!source || source.type !== "card" || typeof source.id !== "number") {
      return;
    }

    const card = client_cards[source.id];
    if (!card) {
      return;
    }

    card.dragging = true;
    this.onStateChanged?.();
  }

  private handleLeftMouseStopDrag(context: InputContext): void {
    const source = context.sourceEntity;
    if (!source || source.type !== "card") {
      return;
    }

    const cardId = this.resolveCardEntityId(source);
    if (cardId == null) {
      return;
    }

    const card = client_cards[cardId];
    if (!card) {
      return;
    }

    card.dragging = false;

    const target = context.targetEntity;
    if (target?.type === "tile") {
      const destination = this.resolveTileEntityLocation(target);
      if (destination) {
        updateClientCardLocation(cardId, destination.zone, destination.position);
      }
    }

    this.onStateChanged?.();
  }

  private resolveCardEntityId(entity: { id: number | string | null; ref?: unknown }): number | null {
    if (typeof entity.ref === "object" && entity.ref !== null) {
      const card_id = (entity.ref as { card_id?: unknown }).card_id;
      if (typeof card_id === "number") {
        return card_id;
      }
    }

    return typeof entity.id === "number" ? entity.id : null;
  }

  private resolveTileEntityLocation(entity: { id: number | string | null; ref?: unknown }): { zone: number; position: number } | null {
    if (typeof entity.ref === "object" && entity.ref !== null) {
      const zone = (entity.ref as { zone?: unknown }).zone;
      const position = (entity.ref as { position?: unknown }).position;

      if (typeof zone === "number" && typeof position === "number") {
        return { zone, position };
      }
    }

    if (typeof entity.id === "string") {
      const tileCardId = Number(entity.id);
      if (Number.isInteger(tileCardId) && tileCardId > 0) {
        const tileCard = client_cards[tileCardId];
        if (tileCard) {
          return {
            zone: tileCard.zone,
            position: tileCard.position,
          };
        }
      }

      const match = /^zone:(\d+):(\d+):(\d+)$/.exec(entity.id);
      if (match) {
        const zone = Number(match[1]);
        const local_q = Number(match[2]);
        const local_r = Number(match[3]);
        return {
          zone,
          position: packPosition(local_q, local_r),
        };
      }
    }

    return null;
  }

  private selectSingleCard(cardId: number): void {
    const card = client_cards[cardId];
    if (!card) {
      return;
    }

    setSelectedState(cardId, card.zone, card.position);

    for (const key in client_cards) {
      const id = Number(key);
      client_cards[id].selected = id === cardId;
    }

    this.onStateChanged?.();
  }

  private selectSingleTile(tileId: string): void {
    const cardId = Number(tileId);
    if (Number.isInteger(cardId) && cardId > 0) {
      this.selectSingleCard(cardId);
      return;
    }

    const match = /^zone:(\d+):(\d+):(\d+)$/.exec(tileId);
    if (!match) {
      return;
    }

    const zone = Number(match[1]);
    const local_q = Number(match[2]);
    const local_r = Number(match[3]);
    const position = packPosition(local_q, local_r);

    setSelectedState(0, zone, position);

    for (const key in client_cards) {
      client_cards[Number(key)].selected = false;
    }

    this.onStateChanged?.();
  }
}
