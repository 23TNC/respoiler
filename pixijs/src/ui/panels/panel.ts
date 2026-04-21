import { Container, Graphics } from "pixi.js";

import type { HitEntity, InputPanelRegistration } from "../input/types";
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

  private _dirty = true;

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

  markDirty(): void { this._dirty = true; }
  isDirty(): boolean { return this._dirty; }
  clearDirty(): void { this._dirty = false; }

  setLayout(layoutRect: LayoutRect, panelPadding: number): void {
    const changed = (
      this.panelPadding !== panelPadding ||
      this.layoutRect.x !== layoutRect.x ||
      this.layoutRect.y !== layoutRect.y ||
      this.layoutRect.width !== layoutRect.width ||
      this.layoutRect.height !== layoutRect.height
    );
    this.layoutRect = layoutRect;
    this.panelPadding = panelPadding;
    if (changed) {
      this.redrawFrame();
      this.markDirty();
    }
  }

  refresh(_screenWidth: number, _screenHeight: number): void {
    // Implemented by subclasses when needed.
  }

  getInputRegistration(priority: number): InputPanelRegistration {
    return {
      id: this.layoutRect.id,
      priority,
      containsPoint: (x, y) => this.containsPoint(x, y),
      hitTest: (x, y, options) => this.hitTest(x, y, options),
    };
  }

  protected clearContent(): void {
    this.content.removeChildren().forEach(child => child.destroy({ children: true }));
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

  protected containsPoint(x: number, y: number): boolean {
    const innerRect = this.getInnerRect();
    const withinX = x >= innerRect.x && x <= (innerRect.x + innerRect.width);
    const withinY = y >= innerRect.y && y <= (innerRect.y + innerRect.height);
    return withinX && withinY;
  }

  protected hitTest(_x: number, _y: number, _options?: { ignoreEntity?: HitEntity | null }): HitEntity | null {
    return null;
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
