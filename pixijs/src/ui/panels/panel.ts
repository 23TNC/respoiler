import { Container, Graphics } from "pixi.js";

import type { LayoutRect } from "./layout";

const PANEL_FILL = 0x172233;
const PANEL_STROKE = 0x8da6c6;

export class Panel {
  readonly root: Container;

  protected readonly background: Graphics;
  protected readonly content: Container;
  protected readonly contentMask: Graphics;

  protected layoutRect: LayoutRect;
  protected panelPadding: number;

  constructor(layoutRect: LayoutRect, panelPadding: number) {
    this.layoutRect = layoutRect;
    this.panelPadding = panelPadding;

    this.root = new Container();
    this.root.label = `panel:${layoutRect.id}`;

    this.background = new Graphics();
    this.content = new Container();
    this.content.label = `panel-content:${layoutRect.id}`;
    this.contentMask = new Graphics();

    this.root.addChild(this.background);
    this.root.addChild(this.contentMask);
    this.root.addChild(this.content);

    this.content.mask = this.contentMask;

    this.redrawFrame();
  }

  setLayout(layoutRect: LayoutRect, panelPadding: number): void {
    this.layoutRect = layoutRect;
    this.panelPadding = panelPadding;
    this.redrawFrame();
  }

  refresh(_screenWidth: number, _screenHeight: number): void {
    // Implemented by subclasses when needed.
  }

  protected clearContent(): void {
    this.content.removeChildren();
  }

  protected getLayoutRect(): LayoutRect {
    return this.layoutRect;
  }

  protected getInnerRect(): LayoutRect {
    return {
      ...this.layoutRect,
      x: this.layoutRect.x + this.panelPadding,
      y: this.layoutRect.y + this.panelPadding,
      width: Math.max(0, this.layoutRect.width - (2 * this.panelPadding)),
      height: Math.max(0, this.layoutRect.height - (2 * this.panelPadding)),
    };
  }

  private redrawFrame(): void {
    const innerRect = this.getInnerRect();
    const cornerRadius = Math.max(0, this.panelPadding * 2);

    this.background.clear();
    this.background
      .roundRect(innerRect.x, innerRect.y, innerRect.width, innerRect.height, cornerRadius)
      .fill({ color: PANEL_FILL, alpha: 0.9 })
      .stroke({ color: PANEL_STROKE, alpha: 1, width: Math.max(1, this.panelPadding * 0.5) });

    this.contentMask.clear();
    this.contentMask
      .roundRect(innerRect.x, innerRect.y, innerRect.width, innerRect.height, cornerRadius)
      .fill({ color: 0xffffff, alpha: 1 });
  }
}
