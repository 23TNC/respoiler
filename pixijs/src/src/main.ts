import './style.css';
import { startGameScene } from './game/scenes/GameScene';

const root = document.getElementById('app');
if (!root) {
  throw new Error('Missing #app container');
}

void startGameScene(root);
