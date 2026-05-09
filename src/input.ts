import type { Game } from "./game";
import type { Renderer } from "./renderer";

interface TouchState {
  id: number;
  x: number;
  y: number;
  startedAt: number;
}

export class InputController {
  private touch: TouchState | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private game: Game,
    private renderer: Renderer,
  ) {
    canvas.addEventListener("pointerdown", this.onDown, { passive: false });
    canvas.addEventListener("pointerup", this.onUp, { passive: false });
    canvas.addEventListener("pointercancel", this.onCancel, { passive: false });
    canvas.addEventListener("pointermove", this.onMove, { passive: true });
    canvas.addEventListener("pointerleave", this.onLeave, { passive: true });
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    window.addEventListener("keydown", this.onKey);
  }

  private onMove = (event: PointerEvent): void => {
    // 호버 미리보기 — 마우스가 누르지 않은 상태에서도 동작 (마우스 전용 효과)
    if (event.pointerType === "touch" && !this.touch) return;
    const col = this.renderer.screenToColumn(event.clientX, event.clientY);
    this.game.setHoverColumn(col);
  };

  private onLeave = (): void => {
    this.game.setHoverColumn(null);
  };

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

    if (mode === "planning") {
      // Planning: 탭 = 그 컬럼에 현재 큐 피스 배치
      // 위로 스와이프 = 포기, 아래로 스와이프 = 마지막 placement undo
      if (vertical && dy < -52) {
        this.game.abandon();
      } else if (vertical && dy > 52) {
        this.game.undoLastPlacement();
      } else if (isTap) {
        const col = this.renderer.screenToColumn(event.clientX, event.clientY);
        if (col !== null) {
          this.game.placeAt(col);
        }
      }
    } else if (horizontal && dx < -70) {
      this.game.challengeFeed();
    } else if (horizontal && dx > 70) {
      this.game.returnFromChallenge();
    } else if (vertical && Math.abs(dy) > 58) {
      if (dy < 0) this.game.nextFeed(1);
      else this.game.nextFeed(-1);
    } else if (mode === "failed") {
      if (isTap) this.game.retry();
    } else if (mode === "clear") {
      if (isTap) this.game.advance();
    } else if (isTap) {
      this.game.startPlanning();
    }
    this.touch = null;
  };

  private onCancel = (event: PointerEvent): void => {
    if (this.touch?.id === event.pointerId) {
      this.touch = null;
    }
  };

  private onKey = (event: KeyboardEvent): void => {
    const mode = this.game.snapshot.mode;
    if (mode === "planning") {
      if (event.key === "ArrowUp" || event.key === " " || event.key.toLowerCase() === "r") {
        this.game.rotatePlanningPiece();
      }
      if (event.key === "Backspace" || event.key.toLowerCase() === "u") {
        this.game.undoLastPlacement();
      }
      if (event.key === "Escape") this.game.abandon();
    } else if (mode === "failed") {
      if (event.key === "Enter" || event.key === " ") this.game.retry();
    } else if (mode === "clear") {
      if (event.key === "Enter" || event.key === " ") this.game.advance();
    } else if (mode === "feed") {
      if (event.key === "Enter" || event.key === " ") this.game.startPlanning();
    }
    if (event.key.toLowerCase() === "s") this.game.toggleSound();
    if (event.key.toLowerCase() === "c") this.game.copyShareUrl();
  };
}
