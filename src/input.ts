import type { Game } from "./game";

interface TouchState {
  id: number;
  x: number;
  y: number;
  startedAt: number;
}

export class InputController {
  private touch: TouchState | null = null;

  constructor(private canvas: HTMLCanvasElement, private game: Game) {
    canvas.addEventListener("pointerdown", this.onDown, { passive: false });
    canvas.addEventListener("pointerup", this.onUp, { passive: false });
    canvas.addEventListener("pointercancel", this.onCancel, { passive: false });
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    window.addEventListener("keydown", this.onKey);
  }

  private onDown = (event: PointerEvent): void => {
    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    this.touch = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startedAt: performance.now(),
    };
  };

  private onUp = (event: PointerEvent): void => {
    event.preventDefault();
    if (!this.touch || this.touch.id !== event.pointerId) return;
    const dx = event.clientX - this.touch.x;
    const dy = event.clientY - this.touch.y;
    const elapsed = performance.now() - this.touch.startedAt;
    const mode = this.game.snapshot.mode;
    const horizontal = Math.abs(dx) > Math.abs(dy) * 1.15;
    const vertical = Math.abs(dy) > Math.abs(dx) * 1.15;
    const isTap = Math.abs(dx) < 24 && Math.abs(dy) < 24 && elapsed < 320;

    if (mode === "playing") {
      if (horizontal && Math.abs(dx) > 38) this.game.move(dx < 0 ? -1 : 1);
      else if (vertical && dy > 52) this.game.hardDrop();
      else if (vertical && dy < -52) this.game.abandon();
      else if (isTap) this.game.rotate();
    } else if (horizontal && dx < -70) {
      this.game.challengeFeed();
    } else if (horizontal && dx > 70) {
      this.game.returnFromChallenge();
    } else if (vertical && Math.abs(dy) > 58) {
      if (dy < 0) this.game.nextFeed(1);
      else this.game.nextFeed(-1);
    } else if (mode === "clear" || mode === "failed") {
      this.game.retry();
    } else if (isTap) {
      this.game.startPlaying();
    }
    this.touch = null;
  };

  private onCancel = (event: PointerEvent): void => {
    if (this.touch?.id === event.pointerId) {
      this.touch = null;
    }
  };

  private onKey = (event: KeyboardEvent): void => {
    if (event.key === "ArrowLeft") this.game.move(-1);
    if (event.key === "ArrowRight") this.game.move(1);
    if (event.key === "ArrowUp" || event.key === " ") this.game.rotate();
    if (event.key === "ArrowDown" || event.key === "Enter") this.game.hardDrop();
    if (event.key.toLowerCase() === "s") this.game.toggleSound();
    if (event.key === "Escape") this.game.abandon();
  };
}
