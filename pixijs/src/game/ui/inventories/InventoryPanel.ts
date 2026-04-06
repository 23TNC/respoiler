import { Container, Graphics, Text, TextStyle } from 'pixi.js';

const PANEL_BG = 0x1f2430;
const PANEL_BORDER = 0x53627c;
const TITLE_STYLE = new TextStyle({
  fill: 0xe6edf7,
  fontSize: 16,
  fontFamily: 'Arial',
  fontWeight: '600',
});

export class InventoryPanel {
  readonly container = new Container();

  private readonly background = new Graphics();
  private readonly title: Text;

  constructor(label: string) {
    this.title = new Text({ text: label, style: TITLE_STYLE });
    this.container.addChild(this.background, this.title);
  }

  layout(x: number, y: number, width: number, height: number): void {
    this.container.position.set(x, y);

    this.background.clear();
    this.background
      .roundRect(0, 0, width, height, 8)
      .fill(PANEL_BG)
      .stroke({ color: PANEL_BORDER, width: 2 });

    this.title.position.set(12, 10);
  }
}
