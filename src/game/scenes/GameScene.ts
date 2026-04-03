import { Application } from 'pixi.js';
import { loadStaticData } from '../../data/loader';
import { axialKey } from '../hex/coords';
import { HexBoardRenderer } from '../render/HexBoardRenderer';
import { generateMockWorld } from '../world/mockWorld';

export async function startGameScene(container: HTMLElement): Promise<void> {
  const app = new Application();
  await app.init({
    width: window.innerWidth,
    height: window.innerHeight,
    antialias: true,
    background: '#101b2d',
    resizeTo: window,
  });

  container.appendChild(app.canvas);

  const staticData = loadStaticData();
  const world = generateMockWorld(staticData.tileTypes, staticData.verbs, 2);

  const boardRenderer = new HexBoardRenderer(52);
  boardRenderer.centerOn(app.screen.width, app.screen.height);
  app.stage.addChild(boardRenderer.root);

  const render = (): void => {
    boardRenderer.renderTiles(world.tiles.values(), staticData, (coord) => {
      for (const tile of world.tiles.values()) {
        tile.selected = false;
      }

      const key = axialKey(coord);
      const selectedTile = world.tiles.get(key);
      if (!selectedTile) {
        return;
      }

      selectedTile.selected = true;
      // eslint-disable-next-line no-console
      console.log('Selected tile', selectedTile);
      render();
    });
  };

  render();

  window.addEventListener('resize', () => {
    boardRenderer.centerOn(app.screen.width, app.screen.height);
    render();
  });
}
