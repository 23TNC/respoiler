import type { FederatedPointerEvent } from "pixi.js";

import { InteractionResolver } from "./interaction_resolver";
import type {
  HitEntity,
  InputContext,
  InputPanelRegistration,
  InputState,
  PointerRecord,
} from "./types";

const DEFAULT_DRAG_THRESHOLD = 8;

interface InputManagerOptions {
  interactionResolver: InteractionResolver;
  dragThreshold?: number;
}

export class InputManager {
  private readonly interactionResolver: InteractionResolver;
  private readonly dragThreshold: number;
  private readonly panels: InputPanelRegistration[];

  private readonly state: InputState;

  constructor(options: InputManagerOptions) {
    this.interactionResolver = options.interactionResolver;
    this.dragThreshold = options.dragThreshold ?? DEFAULT_DRAG_THRESHOLD;
    this.panels = [];

    this.state = {
      leftButtonDown: false,
      leftDrag: false,
      leftMouseDown: null,
      leftMouseUp: null,
      leftMouseStartDrag: null,
    };
  }

  registerPanel(panel: InputPanelRegistration): void {
    this.panels.push(panel);
    this.panels.sort((a, b) => b.priority - a.priority);
  }

  clearPanels(): void {
    this.panels.length = 0;
  }

  onPointerDown(event: FederatedPointerEvent): void {
    if (!isPrimaryLeftDown(event)) {
      return;
    }

    const time = event.timeStamp ?? performance.now();
    const x = event.global.x;
    const y = event.global.y;
    const hit = this.hitTest(x, y);

    // State updates happen before resolver calls.
    this.state.leftButtonDown = true;
    this.state.leftDrag = false;
    this.state.leftMouseStartDrag = null;
    this.state.leftMouseDown = {
      entity: hit.entity,
      panelId: hit.panelId,
      x,
      y,
      time,
    };

    this.interactionResolver.resolve("left_mouse_down", this.buildContext(x, y, time));
  }

  onPointerMove(event: FederatedPointerEvent): void {
    if (!this.state.leftButtonDown) {
      return;
    }

    const x = event.global.x;
    const y = event.global.y;
    const time = event.timeStamp ?? performance.now();

    this.interactionResolver.resolve("left_mouse_move", this.buildContext(x, y, time));

    if (this.state.leftDrag) {
      return;
    }

    const down = this.state.leftMouseDown;
    if (!down) {
      return;
    }

    const dx = x - down.x;
    const dy = y - down.y;

    if (Math.abs(dx) < this.dragThreshold && Math.abs(dy) < this.dragThreshold) {
      return;
    }

    // State updates happen before resolver calls.
    this.state.leftDrag = true;
    this.state.leftMouseStartDrag = {
      entity: down.entity,
      panelId: down.panelId,
      x,
      y,
      time,
    };

    this.interactionResolver.resolve("left_mouse_start_drag", this.buildContext(x, y, time));
  }

  onPointerUp(event: FederatedPointerEvent): void {
    if (!isPrimaryLeftUp(event)) {
      return;
    }

    const time = event.timeStamp ?? performance.now();
    const x = event.global.x;
    const y = event.global.y;
    const ignoreEntity = this.state.leftMouseDown?.entity ?? null;
    const hit = this.hitTest(x, y, { ignoreEntity });

    // State updates happen before resolver calls.
    this.state.leftMouseUp = {
      entity: hit.entity,
      panelId: hit.panelId,
      x,
      y,
      time,
    };
    this.state.leftButtonDown = false;

    this.interactionResolver.resolve("left_mouse_up", this.buildContext(x, y, time));

    if (this.state.leftDrag) {
      this.interactionResolver.resolve("left_mouse_stop_drag", this.buildContext(x, y, time));
    } else {
      this.interactionResolver.resolve("left_mouse_click", this.buildContext(x, y, time));
    }

    this.state.leftDrag = false;
  }

  private hitTest(
    x: number,
    y: number,
    options?: { ignoreEntity?: HitEntity | null },
  ): { panelId: string | null; entity: HitEntity | null } {
    for (const panel of this.panels) {
      if (!panel.containsPoint(x, y)) {
        continue;
      }

      return {
        panelId: panel.id,
        entity: panel.hitTest(x, y, options) ?? null,
      };
    }

    return {
      panelId: null,
      entity: null,
    };
  }

  private buildContext(x: number, y: number, time: number): InputContext {
    return {
      down: this.state.leftMouseDown,
      up: this.state.leftMouseUp,
      dragStart: this.state.leftMouseStartDrag,
      pointer: { x, y, time },
      sourcePanelId: this.state.leftMouseDown?.panelId ?? null,
      sourceEntity: this.state.leftMouseDown?.entity ?? null,
      targetPanelId: this.state.leftMouseUp?.panelId ?? null,
      targetEntity: this.state.leftMouseUp?.entity ?? null,
      leftButtonDown: this.state.leftButtonDown,
      leftDrag: this.state.leftDrag,
    };
  }
}

function isPrimaryLeftDown(event: FederatedPointerEvent): boolean {
  if (!event.isPrimary) {
    return false;
  }

  if (event.pointerType === "mouse") {
    return event.button === 0;
  }

  return true;
}

function isPrimaryLeftUp(event: FederatedPointerEvent): boolean {
  if (!event.isPrimary) {
    return false;
  }

  if (event.pointerType === "mouse") {
    return event.button === 0;
  }

  return true;
}

export { DEFAULT_DRAG_THRESHOLD };
export type { PointerRecord };
