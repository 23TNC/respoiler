import type { LayoutRect } from "./layout";
import { Panel } from "./panel";

export class DetailsPanel extends Panel {
  constructor(layoutRect: LayoutRect, panelPadding: number) {
    super(layoutRect, panelPadding);
  }
}
