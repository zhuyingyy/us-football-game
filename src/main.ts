import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { DESIGN_WIDTH, DESIGN_HEIGHT } from './config/GameTuning';
import './style.css';

await document.fonts.load('800 48px Barlow');
const viewport = document.getElementById('viewport')!;
const phone = document.getElementById('phone')!;
const fitPhone = () => {
  const frameWidth = 856, frameHeight = 1696;
  const scale = Math.min(innerWidth / frameWidth, innerHeight / frameHeight, 1);
  phone.style.left = `${12 * scale}px`;
  phone.style.transform = `scale(${scale})`;
  viewport.style.width = `${frameWidth * scale}px`;
  viewport.style.height = `${frameHeight * scale}px`;
};
fitPhone();
addEventListener('resize', fitPhone);
window.visualViewport?.addEventListener('resize', fitPhone);
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: DESIGN_WIDTH,
  height: DESIGN_HEIGHT,
  backgroundColor: '#031331',
  // The Ninja Cat phone frame owns all responsive scaling; keep the game at 780 × 1644.
  scale: { mode: Phaser.Scale.NONE, width: DESIGN_WIDTH, height: DESIGN_HEIGHT },
  render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
  input: { activePointers: 2 },
  scene: [GameScene],
});

// Exposed only in development for repeatable browser checks / scene restart checks.
if (import.meta.env.DEV) Object.assign(window, { __FIELD_GOAL_GAME__: game });
if (import.meta.hot) import.meta.hot.dispose(() => {
  removeEventListener('resize', fitPhone);
  window.visualViewport?.removeEventListener('resize', fitPhone);
  game.destroy(true);
});
