import { client_cards, packPosition, setSelectedState } from "../../spacetime/data";
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
    const target = context.targetEntity;
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
    if (!source || source.type !== "card" || typeof source.id !== "number") {
      return;
    }

    const card = client_cards[source.id];
    if (!card) {
      return;
    }

    card.dragging = false;
    this.onStateChanged?.();
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
