import type { Game } from "./game";
import type { Renderer } from "./renderer";

interface TouchState {
  id: number;
  x: number;
  y: number;
  startedAt: number;
  trail: Array<{ x: number; y: number }>;
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

  private onDown = (event: PointerEvent): void => {
    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    this.touch = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startedAt: performance.now(),
      trail: [{ x: event.clientX, y: event.clientY }],
    };
    // 터치 시작 시점에 호버 미리보기도 시작 (모바일에서 미리보기 노출)
    if (this.game.snapshot.mode === "planning") {
      const col = this.renderer.screenToColumn(event.clientX, event.clientY);
      this.game.setHoverColumn(col);
      this.game.setTouchTrail(this.touch.trail);
    }
  };

  private onMove = (event: PointerEvent): void => {
    if (event.pointerType === "touch" && !this.touch) return;
    const col = this.renderer.screenToColumn(event.clientX, event.clientY);
    this.game.setHoverColumn(col);
    if (this.touch && this.touch.id === event.pointerId) {
      const last = this.touch.trail[this.touch.trail.length - 1];
      const dx = event.clientX - last.x;
      const dy = event.clientY - last.y;
      // 4px 이상 이동했을 때만 점 추가 (밀도 조절)
      if (dx * dx + dy * dy >= 16) {
        this.touch.trail.push({ x: event.clientX, y: event.clientY });
        this.game.setTouchTrail(this.touch.trail);
      }
    }
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
      // 큰 세로 스와이프 = 제스처 (포기/undo)
      if (vertical && Math.abs(dy) > 52) {
        if (dy < 0) this.game.abandon();
        else this.game.undoLastPlacement();
      } else {
        // 핸드 카드 우선 검사
        const handIdx = this.renderer.screenToHandIndex(event.clientX, event.clientY);
        if (handIdx !== null) {
          this.game.selectPiece(handIdx);
        } else {
          // 어디서 떼든 (드래그 끝 위치) 그 컬럼에 배치
          const col = this.renderer.screenToColumn(event.clientX, event.clientY);
          if (col !== null) {
            this.game.placeAt(col);
          }
        }
      }
      // 터치 종료 시 trail/hover 정리 (모바일은 미리보기 사라져야 함)
      if (event.pointerType === "touch") {
        this.game.setHoverColumn(null);
      }
      this.game.setTouchTrail([]);
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
      this.game.setTouchTrail([]);
      this.game.setHoverColumn(null);
    }
  };

  private onLeave = (): void => {
    this.game.setHoverColumn(null);
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
