import { Container, Graphics, PointData, Polygon, Rectangle, FederatedPointerEvent, type DisplayObject } from "pixi.js";

export type InteractableKind = "rect-card" | "hex-card";

export interface InteractableMetadata {
  kind: InteractableKind;
  name?: string;
  card_type?: number;
  card_id?: string;
  linked?: number;
  zone?: number;
  position?: number;
  tile_id?: string;
  definition?: string;
  world_q?: number;
  world_r?: number;
  z?: number;
}

interface InteractableRegistration {
  target: Container;
  metadata: InteractableMetadata;
  draggable: boolean;
  setSelected: (selected: boolean) => void;
}

interface DragState {
  interactionToken: number;
  registration: InteractableRegistration;
  pointerId: number;
  pointerOffsetX: number;
  pointerOffsetY: number;
  parent: Container;
  originalIndex: number;
  homeX: number;
  homeY: number;
  moved: boolean;
}

interface PointerInteractionState {
  interactionToken: number;
  registration: InteractableRegistration;
  pointerId: number;
  downX: number;
  downY: number;
  clickEligible: boolean;
}

interface InteractionManagerConfig {
  stage: Container;
  onSelectionChanged?: (metadata: InteractableMetadata | null) => void;
}

export class InteractionManager {
  private readonly stage: Container;
  private readonly onSelectionChanged?: (metadata: InteractableMetadata | null) => void;

  private readonly registrations = new Set<InteractableRegistration>();

  private selected: InteractableRegistration | null = null;

  private dragState: DragState | null = null;

  private readonly pointerInteractions = new Map<number, PointerInteractionState>();

  private nextInteractionToken = 1;

  private readonly hexDropTargets = new Set<InteractableRegistration>();

  private readonly returnTweenCancels = new WeakMap<DisplayObject, () => void>();

  private worldDropBounds: Rectangle | null = null;

  public constructor(config: InteractionManagerConfig) {
    this.stage = config.stage;
    this.onSelectionChanged = config.onSelectionChanged;

    this.stage.eventMode = "static";
    this.stage.on("pointermove", this.onStagePointerMove, this);
    this.stage.on("pointerup", this.onStagePointerUp, this);
    this.stage.on("pointerupoutside", this.onStagePointerUp, this);
  }

  public clear(): void {
    for (const registration of this.registrations) {
      registration.target.removeAllListeners();
      registration.setSelected(false);
      this.cancelReturnTween(registration.target);
    }

    this.registrations.clear();
    this.hexDropTargets.clear();
    this.selected = null;
    this.dragState = null;
    this.pointerInteractions.clear();
    this.worldDropBounds = null;
  }

  public setWorldDropBounds(bounds: Rectangle | null): void {
    if (!bounds) {
      this.worldDropBounds = null;
      return;
    }

    this.worldDropBounds = new Rectangle(bounds.x, bounds.y, bounds.width, bounds.height);
  }

  public registerRectCard(target: Container, metadata: InteractableMetadata, setSelected: (selected: boolean) => void): void {
    const registration = this.register({ target, metadata, draggable: true, setSelected });
    void registration;
  }

  public registerHexTile(target: Container, metadata: InteractableMetadata, setSelected: (selected: boolean) => void): void {
    const registration = this.register({ target, metadata, draggable: false, setSelected });
    this.hexDropTargets.add(registration);
  }

  public restoreSelection(matches: (metadata: InteractableMetadata) => boolean): void {
    if (this.selected) {
      this.selected.setSelected(false);
      this.selected = null;
    }

    for (const registration of this.registrations) {
      if (!matches(registration.metadata)) {
        continue;
      }

      this.selected = registration;
      this.selected.setSelected(true);
      break;
    }
  }

  private register(registration: InteractableRegistration): InteractableRegistration {
    this.registrations.add(registration);

    registration.target.eventMode = "static";

    registration.target.on("pointerdown", (event: FederatedPointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      this.onPointerDown(registration, event);
    });

    return registration;
  }

  private onPointerDown(registration: InteractableRegistration, event: FederatedPointerEvent): void {
    const interaction: PointerInteractionState = {
      interactionToken: this.nextInteractionToken,
      registration,
      pointerId: event.pointerId,
      downX: event.global.x,
      downY: event.global.y,
      clickEligible: true,
    };
    this.nextInteractionToken += 1;

    this.pointerInteractions.set(event.pointerId, interaction);

    if (registration.draggable) {
      this.cancelReturnTween(registration.target);
    }

    event.stopPropagation();
  }

  private onStagePointerMove(event: FederatedPointerEvent): void {
    const interaction = this.pointerInteractions.get(event.pointerId);
    if (!interaction || !interaction.registration.draggable) {
      return;
    }

    if (this.dragState && event.pointerId !== this.dragState.pointerId) {
      return;
    }

    if (!this.dragState) {
      const movedX = event.global.x - interaction.downX;
      const movedY = event.global.y - interaction.downY;
      const exceededThreshold = ((movedX * movedX) + (movedY * movedY)) > 9;
      if (!exceededThreshold) {
        return;
      }

      const parent = interaction.registration.target.parent;
      if (!parent || !(parent instanceof Container)) {
        interaction.clickEligible = false;
        return;
      }

      const localPoint = parent.toLocal({ x: interaction.downX, y: interaction.downY });
      this.dragState = {
        interactionToken: interaction.interactionToken,
        registration: interaction.registration,
        pointerId: interaction.pointerId,
        pointerOffsetX: localPoint.x - interaction.registration.target.x,
        pointerOffsetY: localPoint.y - interaction.registration.target.y,
        parent,
        originalIndex: parent.getChildIndex(interaction.registration.target),
        homeX: interaction.registration.target.x,
        homeY: interaction.registration.target.y,
        moved: false,
      };

      interaction.clickEligible = false;
      parent.addChild(interaction.registration.target);
    }

    if (!this.dragState || this.dragState.interactionToken !== interaction.interactionToken) {
      return;
    }

    const localPoint = this.dragState.parent.toLocal(event.global);
    const nextX = localPoint.x - this.dragState.pointerOffsetX;
    const nextY = localPoint.y - this.dragState.pointerOffsetY;

    this.dragState.registration.target.x = nextX;
    this.dragState.registration.target.y = nextY;
    this.dragState.moved = true;
  }

  private onStagePointerUp(event: FederatedPointerEvent): void {
    if (event.button !== 0) {
      return;
    }

    this.finishPointerInteraction(event);
  }

  private finishPointerInteraction(event: FederatedPointerEvent): void {
    const interaction = this.pointerInteractions.get(event.pointerId);
    if (!interaction) {
      return;
    }

    this.pointerInteractions.delete(event.pointerId);

    if (
      this.dragState
      && this.dragState.pointerId === event.pointerId
      && this.dragState.interactionToken === interaction.interactionToken
    ) {
      const activeDrag = this.dragState;
      this.dragState = null;
      this.releaseDrag(activeDrag, event);
      return;
    }

    if (interaction.clickEligible) {
      this.select(interaction.registration);
    }
  }

  private releaseDrag(activeDrag: DragState, event: FederatedPointerEvent): void {
    if (activeDrag.originalIndex < activeDrag.parent.children.length) {
      activeDrag.parent.setChildIndex(activeDrag.registration.target, activeDrag.originalIndex);
    }

    // Guard drops by pointer position only: if release happens outside the board panel,
    // treat it as invalid before doing any hex hit detection.
    if (this.worldDropBounds && !this.worldDropBounds.contains(event.global.x, event.global.y)) {
      this.returnCardToHome(activeDrag);
      return;
    }

    const dropTarget = this.findHexDropTarget(event.global);

    if (dropTarget) {
      console.log(
        "Dropped card",
        activeDrag.registration.metadata,
        "onto hex tile",
        dropTarget.metadata,
      );
      return;
    }

    this.returnCardToHome(activeDrag);
  }

  private findHexDropTarget(globalPoint: PointData): InteractableRegistration | null {
    const targetsInDrawOrder = [...this.hexDropTargets];

    for (let index = targetsInDrawOrder.length - 1; index >= 0; index -= 1) {
      const target = targetsInDrawOrder[index];
      if (!target?.target) {
        continue;
      }

      const localPoint = target.target.toLocal(globalPoint);

      if (containsHitAreaPoint(target.target.hitArea, localPoint.x, localPoint.y)) {
        return target;
      }

      const bounds = target.target.getBounds();
      const isInsideBounds =
        Number.isFinite(bounds.x)
        && Number.isFinite(bounds.y)
        && Number.isFinite(bounds.width)
        && Number.isFinite(bounds.height)
        &&
        globalPoint.x >= bounds.x
        && globalPoint.x <= (bounds.x + bounds.width)
        && globalPoint.y >= bounds.y
        && globalPoint.y <= (bounds.y + bounds.height);

      if (isInsideBounds) {
        return target;
      }
    }

    return null;
  }

  private returnCardToHome(activeDrag: DragState): void {
    const target = activeDrag.registration.target;
    const startX = target.x;
    const startY = target.y;
    const durationMs = 150;
    const startedAt = performance.now();
    let rafId = 0;
    let cancelled = false;

    const cancel = (): void => {
      cancelled = true;
      if (rafId !== 0) {
        cancelAnimationFrame(rafId);
      }
    };

    this.cancelReturnTween(target);
    this.returnTweenCancels.set(target, cancel);

    const step = (nowMs: number): void => {
      if (cancelled) {
        return;
      }

      const t = Math.min(1, (nowMs - startedAt) / durationMs);
      const eased = 1 - ((1 - t) * (1 - t));

      target.x = startX + ((activeDrag.homeX - startX) * eased);
      target.y = startY + ((activeDrag.homeY - startY) * eased);

      if (t < 1) {
        rafId = requestAnimationFrame(step);
        return;
      }

      target.x = activeDrag.homeX;
      target.y = activeDrag.homeY;
      this.returnTweenCancels.delete(target);
    };

    rafId = requestAnimationFrame(step);
  }

  private cancelReturnTween(target: DisplayObject): void {
    const cancel = this.returnTweenCancels.get(target);
    if (!cancel) {
      return;
    }

    cancel();
    this.returnTweenCancels.delete(target);
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
    this.onSelectionChanged?.(this.selected.metadata);
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
