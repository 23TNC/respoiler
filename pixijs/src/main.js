import { createDataProvider } from './services/dataProvider';
import { CardGame } from './game/CardGame';

const root = document.getElementById('app');
const provider = createDataProvider();
const game = new CardGame(root, provider);

game.init();
