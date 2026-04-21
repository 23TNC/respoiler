import {
  client_cards,
  client_cards_by_zone,
  packPosition,
  selected_card_id,
  selected_position,
  selected_zone,
  setSelectedState,
  updateClientCardLocation,
  viewed_id,
} from "../../spacetime/data";
import type { InputAction, InputContext } from "./types";

type ActiveDragMode = "none" | "card" | "viewport";

interface InteractionResolverOptions {
  onStateChanged?: () => void;
  getWorldViewport?: () => { q: number; r: number } | null;
  setWorldViewport?: (q: number, r: number) => void;
  screenDeltaToWorldDelta?: (dx: number, dy: number) => { q: number; r: number };
}

export class InteractionResolver {
  private readonly onStateChanged?: () => void;
  private readonly getWorldViewport?: () => { q: number; r: number } | null;
  private readonly setWorldViewport?: (q: number, r: number) => void;
  private readonly screenDeltaToWorldDelta?: (dx: number, dy: number) => { q: number; r: number };

  private activeDragMode: ActiveDragMode = "none";
  private viewport_drag_candidate = false;
  private viewport_dragging = false;
  private viewport_drag_start_screen_x = 0;
  private viewport_drag_start_screen_y = 0;
  private viewport_drag_start_world_q = 0;
  private viewport_drag_start_world_r = 0;
  private readonly viewport_drag_threshold_px = 6;
  private suppressNextClick = false;

  constructor(options: InteractionResolverOptions = {}) {
    this.onStateChanged = options.onStateChanged;
    this.getWorldViewport = options.getWorldViewport;
    this.setWorldViewport = options.setWorldViewport;
    this.screenDeltaToWorldDelta = options.screenDeltaToWorldDelta;
  }

  resolve(action: InputAction, context: InputContext): void {
    switch (action) {
      case "left_mouse_down":
        this.handleLeftMouseDown(context);
        return;
      case "left_mouse_move":
        this.handleLeftMouseMove(context);
        return;
      case "left_mouse_up":
        this.handleLeftMouseUp(context);
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
    if (this.suppressNextClick) {
      this.suppressNextClick = false;
      return;
    }

    const target = context.sourceEntity;
    if (!target) {
      return;
    }
    if (target.type === "card" && typeof target.id === "number") {
      this.selectSingleCard(target.id);
      return;
    }

    if (target.type === "details_cancel") {
      this.cancelSharedLocationCards();
      return;
    }

    if (target.type === "tile" && typeof target.id === "string") {
      this.selectSingleTile(target.id);
    }
  }

  private handleLeftMouseDown(context: InputContext): void {
    // Always discard any residual viewport-drag state from a prior gesture.
    this.resetViewportDragState();
    this.suppressNextClick = false;

    const source = context.sourceEntity;

    // Card path: drag is driven by start_drag / stop_drag handlers.
    if (source?.type === "card" && typeof source.id === "number") {
      this.activeDragMode = "card";
      return;
    }

    // Viewport pan only starts inside worldPanel on tile or empty space.
    if (context.sourcePanelId !== "worldPanel") {
      return;
    }
    if (source && source.type !== "tile") {
      return;
    }

    const viewport = this.getWorldViewport?.();
    if (!viewport) {
      return;
    }

    this.activeDragMode = "viewport";
    this.viewport_drag_candidate = true;
    this.viewport_dragging = false;
    this.viewport_drag_start_screen_x = context.pointer.x;
    this.viewport_drag_start_screen_y = context.pointer.y;
    this.viewport_drag_start_world_q = viewport.q;
    this.viewport_drag_start_world_r = viewport.r;
  }

  private handleLeftMouseMove(context: InputContext): void {
    if (this.activeDragMode !== "viewport" || !this.viewport_drag_candidate) {
      return;
    }

    const dx = context.pointer.x - this.viewport_drag_start_screen_x;
    const dy = context.pointer.y - this.viewport_drag_start_screen_y;

    if (!this.viewport_dragging) {
      if (Math.hypot(dx, dy) < this.viewport_drag_threshold_px) {
        return;
      }
      this.viewport_dragging = true;
      this.suppressNextClick = true;
    }

    this.panViewportFromScreenDelta(dx, dy);
  }

  private handleLeftMouseUp(_context: InputContext): void {
    if (!this.viewport_drag_candidate) {
      return;
    }

    const consumeClick = this.viewport_dragging;
    this.resetViewportDragState();

    if (consumeClick) {
      this.suppressNextClick = true;
    }
  }

  private handleLeftMouseStartDrag(context: InputContext): void {
    const source = context.sourceEntity;
    if (!source || source.type !== "card" || typeof source.id !== "number") {
      return;
    }

    this.activeDragMode = "card";

    const card = client_cards[source.id];
    if (!card) {
      return;
    }

    card.dragging = true;
    this.onStateChanged?.();
  }

  private handleLeftMouseStopDrag(context: InputContext): void {
    // Viewport path already cleaned up in handleLeftMouseUp; make sure mode is reset.
    if (this.activeDragMode !== "card") {
      this.activeDragMode = "none";
      return;
    }

    const source = context.sourceEntity;
    if (!source || source.type !== "card") {
      this.activeDragMode = "none";
      return;
    }

    const cardId = this.resolveCardEntityId(source);
    if (cardId == null) {
      this.activeDragMode = "none";
      return;
    }

    const card = client_cards[cardId];
    if (!card) {
      this.activeDragMode = "none";
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

    this.activeDragMode = "none";
    this.onStateChanged?.();
  }

  private panViewportFromScreenDelta(dx: number, dy: number): void {
    if (!this.setWorldViewport) {
      return;
    }

    const worldDelta = this.screenDeltaToWorldDelta?.(dx, dy) ?? { q: 0, r: 0 };

    this.setWorldViewport(
      this.viewport_drag_start_world_q - worldDelta.q,
      this.viewport_drag_start_world_r - worldDelta.r,
    );
    this.onStateChanged?.();
  }

  private resetViewportDragState(): void {
    this.activeDragMode = "none";
    this.viewport_drag_candidate = false;
    this.viewport_dragging = false;
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

  private cancelSharedLocationCards(): void {
    let zone = selected_zone;
    let position = selected_position;
    let selectedTileCardId = 0;

    if (selected_card_id !== 0) {
      const selectedCard = client_cards[selected_card_id];
      if (!selectedCard || selectedCard.card_type !== 6) {
        return;
      }

      zone = selectedCard.zone;
      position = selectedCard.position;
      selectedTileCardId = selectedCard.card_id;
    }

    if (zone === 0) {
      return;
    }

    const zoneCards = client_cards_by_zone[zone];
    if (!zoneCards) {
      return;
    }

    const cancelableCardIds: number[] = [];

    for (const cardId of zoneCards) {
      const card = client_cards[cardId];
      if (!card) {
        continue;
      }

      if (card.position !== position || card.link !== viewed_id) {
        continue;
      }

      if (card.card_id === selectedTileCardId || card.card_type === 6) {
        continue;
      }

      cancelableCardIds.push(card.card_id);
    }

    for (const cardId of cancelableCardIds) {
      updateClientCardLocation(cardId, 0, 0);
    }

    this.onStateChanged?.();
  }
}
