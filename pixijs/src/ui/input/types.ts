import type { PanelId } from "../panels/layout";

export type HitEntityType =
  | "card"
  | "tile"
  | "details_cancel"
  | "event"
  | "slot"
  | "none";

export type HitEntity = {
  type: HitEntityType;
  id: number | string | null;
  ref?: unknown;
};

export type PointerRecord = {
  entity: HitEntity | null;
  panelId: string | null;
  x: number;
  y: number;
  time: number;
};

export type InputState = {
  leftButtonDown: boolean;
  leftDrag: boolean;
  leftMouseDown: PointerRecord | null;
  leftMouseUp: PointerRecord | null;
  leftMouseStartDrag: PointerRecord | null;
};

export type InputPanelRegistration = {
  id: PanelId;
  priority: number;
  containsPoint: (x: number, y: number) => boolean;
  hitTest: (x: number, y: number, options?: { ignoreEntity?: HitEntity | null }) => HitEntity | null;
};

export type InputAction =
  | "left_mouse_down"
  | "left_mouse_start_drag"
  | "left_mouse_up"
  | "left_mouse_click"
  | "left_mouse_stop_drag";

export type InputContext = {
  down: PointerRecord | null;
  up: PointerRecord | null;
  dragStart: PointerRecord | null;
  pointer: { x: number; y: number; time: number };
  sourcePanelId: string | null;
  sourceEntity: HitEntity | null;
  targetPanelId: string | null;
  targetEntity: HitEntity | null;
  leftButtonDown: boolean;
  leftDrag: boolean;
};
