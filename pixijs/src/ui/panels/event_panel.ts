import type { LayoutRect } from "./layout";
import { Panel } from "./panel";

export class EventPanel extends Panel {
  constructor(layoutRect: LayoutRect, panelPadding: number) {
    super(layoutRect, panelPadding);
  }
}
