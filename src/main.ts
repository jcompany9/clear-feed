import "./style.css";
import { decodePuzzle } from "./encoding";
import { Game } from "./game";
import { InputController } from "./input";
import { Renderer } from "./renderer";
import { SoundSystem } from "./sound";
import type { Puzzle } from "./gameTypes";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("Missing game canvas.");

const sound = new SoundSystem();
const urlState = parseUrl();
const game = new Game(sound, urlState.seed, urlState.puzzle);
const renderer = new Renderer(canvas);
new InputController(canvas, game, renderer);

function parseUrl(): { seed?: number; puzzle?: Puzzle } {
  const params = new URLSearchParams(window.location.search);

  // ?p=<encoded> — 사용자가 만든 퍼즐 (전체 인코딩) 우선 처리
  const p = params.get("p");
  if (p) {
    const decoded = decodePuzzle(p);
    if (decoded && decoded.queue.length > 0) {
      const puzzle: Puzzle = {
        seed: 0, // 0 = 사용자 생성 (시드 없음)
        template: "near-line",
        difficulty: "Normal",
        grid: decoded.grid,
        queue: decoded.queue,
        targetLines: 0,
        movesLimit: decoded.queue.length,
      };
      return { puzzle };
    }
  }

  // ?seed=<숫자> — 시드 기반 자동 생성 퍼즐
  const seed = params.get("seed");
  if (seed) {
    const parsed = Number.parseInt(seed, 10);
    if (Number.isFinite(parsed)) return { seed: parsed };
  }

  return {};
}

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
