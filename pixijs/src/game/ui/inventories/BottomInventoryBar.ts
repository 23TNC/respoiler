import { Container } from 'pixi.js';
import { InventoryPanel } from './InventoryPanel';

const PANEL_TITLES = ['Techniques', 'Essence', 'Sundries', 'Reveries', 'Souls'];
const BAR_HEIGHT = 210;
const OUTER_MARGIN = 16;
const GAP = 10;

export class BottomInventoryBar {
  readonly container = new Container();

  private readonly panels = PANEL_TITLES.map((title) => new InventoryPanel(title));

  constructor() {
    this.panels.forEach((panel) => this.container.addChild(panel.container));
  }

  layout(viewWidth: number, viewHeight: number): void {
    const availableWidth = Math.max(0, viewWidth - OUTER_MARGIN * 2);
    const panelWidth = (availableWidth - GAP * (this.panels.length - 1)) / this.panels.length;
    const panelHeight = BAR_HEIGHT - OUTER_MARGIN;
    const y = viewHeight - BAR_HEIGHT;

    this.panels.forEach((panel, index) => {
      const x = OUTER_MARGIN + index * (panelWidth + GAP);
      panel.layout(x, y, panelWidth, panelHeight);
    });
  }

  clearSoulUiState(): void {
    // Reserved for future soul-specific inventory interactions.
  }
}
