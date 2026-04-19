import { Container, Graphics, PointData, Polygon, Rectangle, FederatedPointerEvent, type DisplayObject } from "pixi.js";

export type InteractableKind = "rect-card" | "hex-card";

export interface InteractableMetadata {
  kind: InteractableKind;
  card_id?: string;
  tile_id?: string;
  definition?: string;
  world_q?: number;
  world_r?: number;
}

interface InteractableRegistration {
  target: Container;
  metadata: InteractableMetadata;
  draggable: boolean;
  setSelected: (selected: boolean) => void;
}

interface DragState {
  registration: InteractableRegistration;
  pointerId: number;
  pointerOffsetX: number;
  pointerOffsetY: number;
  parent: Container;
  originalIndex: number;
}

interface InteractionManagerConfig {
  stage: Container;
  doubleClickThresholdMs?: number;
}

export class InteractionManager {
  private readonly stage: Container;

  private readonly doubleClickThresholdMs: number;

  private readonly registrations = new Set<InteractableRegistration>();

  private readonly pendingSingleClicks = new WeakMap<DisplayObject, number>();

  private readonly lastClickAtMs = new WeakMap<DisplayObject, number>();

  private selected: InteractableRegistration | null = null;

  private dragState: DragState | null = null;

  private readonly hexDropTargets = new Set<InteractableRegistration>();

  public constructor(config: InteractionManagerConfig) {
    this.stage = config.stage;
    this.doubleClickThresholdMs = config.doubleClickThresholdMs ?? 250;

    this.stage.eventMode = "static";
    this.stage.on("pointermove", this.onStagePointerMove, this);
    this.stage.on("pointerup", this.onStagePointerUp, this);
    this.stage.on("pointerupoutside", this.onStagePointerUp, this);
  }

  public clear(): void {
    for (const registration of this.registrations) {
      const pendingClickTimeout = this.pendingSingleClicks.get(registration.target);
      if (pendingClickTimeout !== undefined) {
        clearTimeout(pendingClickTimeout);
        this.pendingSingleClicks.delete(registration.target);
      }

      registration.target.removeAllListeners();
      registration.setSelected(false);
    }

    this.registrations.clear();
    this.hexDropTargets.clear();
    this.selected = null;
    this.dragState = null;
  }

  public registerRectCard(target: Container, metadata: InteractableMetadata, setSelected: (selected: boolean) => void): void {
    const registration = this.register({ target, metadata, draggable: true, setSelected });
    void registration;
  }

  public registerHexTile(target: Container, metadata: InteractableMetadata, setSelected: (selected: boolean) => void): void {
    const registration = this.register({ target, metadata, draggable: false, setSelected });
    this.hexDropTargets.add(registration);
  }

  private register(registration: InteractableRegistration): InteractableRegistration {
    this.registrations.add(registration);

    registration.target.eventMode = "static";

    registration.target.on("pointertap", (event: FederatedPointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      this.onPointerTap(registration, event);
    });

    registration.target.on("pointerdown", (event: FederatedPointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      this.onPointerDown(registration, event);
    });

    registration.target.on("pointerup", (event: FederatedPointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      this.stopDrag(event);
    });

    registration.target.on("pointerupoutside", (event: FederatedPointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      this.stopDrag(event);
    });

    return registration;
  }

  private onPointerTap(registration: InteractableRegistration, event: FederatedPointerEvent): void {
    if (this.dragState?.registration.target === registration.target) {
      return;
    }

    const nowMs = performance.now();
    const lastClickAtMs = this.lastClickAtMs.get(registration.target) ?? 0;
    const pendingSingleClick = this.pendingSingleClicks.get(registration.target);

    if ((nowMs - lastClickAtMs) <= this.doubleClickThresholdMs && pendingSingleClick !== undefined) {
      clearTimeout(pendingSingleClick);
      this.pendingSingleClicks.delete(registration.target);
      this.lastClickAtMs.delete(registration.target);

      console.log("[interaction] double click", registration.metadata);
      return;
    }

    this.lastClickAtMs.set(registration.target, nowMs);

    const timeoutHandle = window.setTimeout(() => {
      this.pendingSingleClicks.delete(registration.target);
      this.select(registration);
    }, this.doubleClickThresholdMs);

    this.pendingSingleClicks.set(registration.target, timeoutHandle);
    event.stopPropagation();
  }

  private onPointerDown(registration: InteractableRegistration, event: FederatedPointerEvent): void {
    if (!registration.draggable || this.dragState) {
      return;
    }

    const parent = registration.target.parent;
    if (!parent || !(parent instanceof Container)) {
      return;
    }

    const localPoint = parent.toLocal(event.global);
    this.dragState = {
      registration,
      pointerId: event.pointerId,
      pointerOffsetX: localPoint.x - registration.target.x,
      pointerOffsetY: localPoint.y - registration.target.y,
      parent,
      originalIndex: parent.getChildIndex(registration.target),
    };

    parent.addChild(registration.target);
  }

  private onStagePointerMove(event: FederatedPointerEvent): void {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
      return;
    }

    const localPoint = this.dragState.parent.toLocal(event.global);
    this.dragState.registration.target.x = localPoint.x - this.dragState.pointerOffsetX;
    this.dragState.registration.target.y = localPoint.y - this.dragState.pointerOffsetY;
  }

  private onStagePointerUp(event: FederatedPointerEvent): void {
    if (event.button !== 0) {
      return;
    }

    this.stopDrag(event);
  }

  private stopDrag(event: FederatedPointerEvent): void {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
      return;
    }

    const activeDrag = this.dragState;
    this.dragState = null;

    if (activeDrag.originalIndex < activeDrag.parent.children.length) {
      activeDrag.parent.setChildIndex(activeDrag.registration.target, activeDrag.originalIndex);
    }

    const dropTarget = this.findHexDropTarget(event.global);

    if (dropTarget) {
      console.log(
        "Dropped card",
        activeDrag.registration.metadata,
        "onto hex tile",
        dropTarget.metadata,
      );
    }
  }

  private findHexDropTarget(globalPoint: PointData): InteractableRegistration | null {
    const targetsInDrawOrder = [...this.hexDropTargets];

    for (let index = targetsInDrawOrder.length - 1; index >= 0; index -= 1) {
      const target = targetsInDrawOrder[index];
      const localPoint = target.target.toLocal(globalPoint);

      if (containsHitAreaPoint(target.target.hitArea, localPoint.x, localPoint.y)) {
        return target;
      }

      if (target.target.getBounds().contains(globalPoint.x, globalPoint.y)) {
        return target;
      }
    }

    return null;
  }

  private select(nextSelection: InteractableRegistration): void {
    if (this.selected?.target === nextSelection.target) {
      return;
    }

    if (this.selected) {
      this.selected.setSelected(false);
    }

    this.selected = nextSelection;
    this.selected.setSelected(true);
  }
}

const containsHitAreaPoint = (hitArea: Rectangle | Polygon | null, x: number, y: number): boolean => {
  if (!hitArea) {
    return false;
  }

  return hitArea.contains(x, y);
};

export const createRectSelectionOutline = (width: number, height: number, cornerRadius: number): Graphics => {
  const outline = new Graphics()
    .roundRect(0, 0, width, height, cornerRadius)
    .stroke({ color: 0xffe066, width: Math.max(2, cornerRadius * 0.4), alpha: 1 });

  outline.visible = false;
  outline.eventMode = "none";
  return outline;
};

export const createHexSelectionOutline = (points: number[]): Graphics => {
  const outline = new Graphics()
    .poly(points)
    .closePath()
    .stroke({ color: 0xffe066, width: 3, alpha: 1 });

  outline.visible = false;
  outline.eventMode = "none";
  return outline;
};
