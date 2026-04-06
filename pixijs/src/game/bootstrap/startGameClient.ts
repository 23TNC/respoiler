import { Application } from 'pixi.js';
import { connectSpacetimeClient } from '../spacetime/client';
import { resolveSoulsForPlayer } from '../spacetime/souls';
import { SoulGameView } from '../views/SoulGameView/SoulGameView';
import { createCenteredMessage } from './messages';

const BOOTSTRAP_PLAYER_ID = 1;

export async function startGameClient(root: HTMLElement): Promise<void> {
  const app = new Application();
  await app.init({
    background: '#11161f',
    resizeTo: root,
    antialias: true,
  });

  root.appendChild(app.canvas);

  try {
    const spacetimeClient = await connectSpacetimeClient();
    const soulResolution = resolveSoulsForPlayer(spacetimeClient, BOOTSTRAP_PLAYER_ID);

    if (soulResolution.status === 'none') {
      showCenteredMessage(
        app,
        `No soul found for player ${BOOTSTRAP_PLAYER_ID}.`,
      );
      return;
    }

    if (soulResolution.status === 'multiple') {
      showCenteredMessage(
        app,
        `Found ${soulResolution.soulIds.length} souls for player ${BOOTSTRAP_PLAYER_ID}. Multi-soul selection is not implemented yet.`,
      );
      return;
    }

    const soulView = new SoulGameView(spacetimeClient);
    app.stage.addChild(soulView.container);

    const layout = () => {
      soulView.resize(app.renderer.width, app.renderer.height);
    };

    app.renderer.on('resize', layout);
    layout();

    soulView.setSoulId(soulResolution.soulId);
  } catch (error) {
    const description =
      error instanceof Error
        ? error.message
        : 'Could not connect to SpacetimeDB.';

    showCenteredMessage(app, `Startup error: ${description}`);
  }
}

function showCenteredMessage(app: Application, text: string): void {
  const message = createCenteredMessage(text);
  app.stage.addChild(message);

  const layout = () => {
    message.position.set(app.renderer.width / 2, app.renderer.height / 2);
  };

  app.renderer.on('resize', layout);
  layout();
}
