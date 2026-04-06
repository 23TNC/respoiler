import { Text, TextStyle } from 'pixi.js';

const MESSAGE_STYLE = new TextStyle({
  fill: 0xffffff,
  fontSize: 22,
  fontFamily: 'Arial',
  align: 'center',
});

export function createCenteredMessage(text: string): Text {
  const message = new Text({ text, style: MESSAGE_STYLE });
  message.anchor.set(0.5);
  return message;
}
