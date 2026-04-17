import { Application, Container, Graphics } from 'pixi.js';

import { createPanelLayout, type PanelId } from './layout/panelLayout';
import { drawInsetPanel } from './rendering/panelRenderer';

const PANEL_ORDER: PanelId[] = [
  'titlePanel',
  'eventPanel',
  'slotPanel',
  'worldPanel',
  'detailsPanel',
  'disciplinesPanel',
  'facultiesPanel',
  'requisitesPanel',
  'reveriesPanel',
  'soulsPanel',
];

const createPanelGraphics = (): Record<PanelId, Graphics> => {
  return {
    titlePanel: new Graphics(),
    eventPanel: new Graphics(),
    slotPanel: new Graphics(),
    worldPanel: new Graphics(),
    detailsPanel: new Graphics(),
    disciplinesPanel: new Graphics(),
    facultiesPanel: new Graphics(),
    requisitesPanel: new Graphics(),
    reveriesPanel: new Graphics(),
    soulsPanel: new Graphics(),
  };
};

const bootstrap = async (): Promise<void> => {
  const app = new Application();

  await app.init({
    background: '#0b0f16',
    resizeTo: window,
    antialias: true,
  });

  const host = document.getElementById('app');

  if (!host) {
    throw new Error('Missing #app container');
  }

  host.appendChild(app.canvas);

  const panelLayer = new Container();
  app.stage.addChild(panelLayer);

  const panelGraphics = createPanelGraphics();

  for (const panelId of PANEL_ORDER) {
    panelLayer.addChild(panelGraphics[panelId]);
  }

  const renderLayout = (): void => {
    const { width, height } = app.screen;
    const padding = height / 120;
    const cornerRadius = padding * 2;
    const layout = createPanelLayout(width, height);

    for (const panelId of PANEL_ORDER) {
      drawInsetPanel(panelGraphics[panelId], layout[panelId], padding, cornerRadius);
    }
  };

  renderLayout();
  window.addEventListener('resize', renderLayout);
};

void bootstrap();
