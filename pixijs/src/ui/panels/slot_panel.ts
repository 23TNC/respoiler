import type { LayoutRect } from "./layout";
import { Panel } from "./panel";
import type { HitEntity } from "../input/types";

export class SlotPanel extends Panel {
  constructor(layoutRect: LayoutRect, panelPadding: number) {
    super(layoutRect, panelPadding);
  }

  protected override hitTest(): HitEntity | null {
    return {
      type: "slot",
      id: this.getLayoutRect().id,
    };
  }
}
