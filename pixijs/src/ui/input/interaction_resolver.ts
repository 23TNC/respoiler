import { client_cards, setSelectedCardId } from "../../spacetime/data";
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
    if (!target || target.type !== "card" || typeof target.id !== "number") {
      return;
    }

    this.selectSingleCard(target.id);
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
    setSelectedCardId(cardId);

    for (const key in client_cards) {
      const id = Number(key);
      client_cards[id].selected = id === cardId;
    }

    this.onStateChanged?.();
  }
}
