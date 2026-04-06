import { startGameClient } from './game/bootstrap/startGameClient';

const root = document.getElementById('app');
if (!root) {
  throw new Error('Missing #app container');
}

void startGameClient(root);
