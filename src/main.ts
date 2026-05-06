import "./style.css";
import { Game } from "./game";
import { InputController } from "./input";
import { Renderer } from "./renderer";
import { SoundSystem } from "./sound";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("Missing game canvas.");

const sound = new SoundSystem();
const game = new Game(sound);
const renderer = new Renderer(canvas);
new InputController(canvas, game);

function applyViewportVars(): void {
  document.documentElement.style.setProperty("--sat", "env(safe-area-inset-top)");
  document.documentElement.style.setProperty("--sab", "env(safe-area-inset-bottom)");
  renderer.resize();
}

function tick(now: number): void {
  game.update(now);
  renderer.render(game.snapshot, now);
  requestAnimationFrame(tick);
}

window.addEventListener("resize", applyViewportVars);
window.addEventListener("orientationchange", applyViewportVars);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) applyViewportVars();
});

applyViewportVars();
requestAnimationFrame(tick);
