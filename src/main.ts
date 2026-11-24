import './style.css';
import { mountGame } from './ui/app';
import type { GameApp } from './ui/app';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) throw new Error('找不到 #game-canvas');

const game = mountGame(canvas);

declare global {
  interface Window {
    game?: GameApp;
  }
}
window.game = game;
