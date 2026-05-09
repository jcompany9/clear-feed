import type { Game } from "./game";
import type { Renderer } from "./renderer";

interface TouchState {
  id: number;
  startX: number;
  startY: number;
  lastX: number;
  startedAt: number;
  startedColumn: number | null;
  pieceStartX: number;
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
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    window.addEventListener("keydown", this.onKey);
  }

  private onDown = (event: PointerEvent): void => {
    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    const startCol = this.renderer.screenToColumn(event.clientX, event.clientY);
    const piece = this.game.snapshot.current;
    this.touch = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      startedAt: performance.now(),
      startedColumn: startCol,
      pieceStartX: piece ? piece.x : 4,
      trail: [{ x: event.clientX, y: event.clientY }],
    };
  };

  private onMove = (event: PointerEvent): void => {
    if (!this.touch || this.touch.id !== event.pointerId) return;
    const dx = event.clientX - this.touch.startX;
    const cellSize = this.renderer.getCellSize();
    if (cellSize > 0 && this.game.snapshot.mode === "planning") {
      // 시작 시점의 피스 위치에서 dx 만큼 컬럼 이동 — 셀 단위 변환
      const colDelta = Math.round(dx / cellSize);
      const targetCol = this.touch.pieceStartX + colDelta;
      this.game.setPieceColumn(targetCol);
    }
    this.touch.lastX = event.clientX;
    const last = this.touch.trail[this.touch.trail.length - 1];
    if ((event.clientX - last.x) ** 2 + (event.clientY - last.y) ** 2 >= 16) {
      this.touch.trail.push({ x: event.clientX, y: event.clientY });
      this.game.setTouchTrail(this.touch.trail);
    }
  };

  private onUp = (event: PointerEvent): void => {
    event.preventDefault();
    if (!this.touch || this.touch.id !== event.pointerId) return;
    const dx = event.clientX - this.touch.startX;
    const dy = event.clientY - this.touch.startY;
    const elapsed = performance.now() - this.touch.startedAt;
    const mode = this.game.snapshot.mode;
    const horizontal = Math.abs(dx) > Math.abs(dy) * 1.15;
    const vertical = Math.abs(dy) > Math.abs(dx) * 1.15;
    const isTap = Math.abs(dx) < 18 && Math.abs(dy) < 18 && elapsed < 320;

    if (mode === "planning") {
      if (vertical && dy > 60) {
        this.game.dropCurrent();
      } else if (vertical && dy < -60) {
        this.game.abandon();
      } else if (isTap) {
        this.game.rotateCurrent();
      }
      // horizontal drag: 이미 onMove에서 setPieceColumn으로 처리됨
      this.game.setTouchTrail([]);
    } else if (mode === "editing") {
      if (isTap) {
        // FINISH 버튼 우선
        if (this.renderer.isFinishButton(event.clientX, event.clientY)) {
          const status = this.game.snapshot.editStatus;
          if (status === "ready") {
            this.game.playEditedPuzzle();
          } else if (status !== "generating") {
            this.game.generateEditedPuzzle();
          }
          // generating 중이면 무시 (이미 진행 중)
        } else {
          // 그 외 = 셀 토글
          const cell = this.renderer.screenToCell(event.clientX, event.clientY);
          if (cell) this.game.editToggleCell(cell.col, cell.row);
        }
      }
      this.game.setTouchTrail([]);
    } else if (mode === "feed" && isTap && this.renderer.isEditButton(event.clientX, event.clientY)) {
      this.game.enterEditor();
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
    }
  };

  private onKey = (event: KeyboardEvent): void => {
    const mode = this.game.snapshot.mode;
    if (mode === "planning") {
      if (event.key === "ArrowLeft") this.game.moveCurrent(-1);
      if (event.key === "ArrowRight") this.game.moveCurrent(1);
      if (event.key === "ArrowUp" || event.key === " " || event.key.toLowerCase() === "r") {
        this.game.rotateCurrent();
      }
      if (event.key === "ArrowDown" || event.key === "Enter") this.game.dropCurrent();
      if (event.key === "Backspace" || event.key.toLowerCase() === "u") {
        this.game.undoLastPlacement();
      }
      if (event.key === "Escape") this.game.abandon();
    } else if (mode === "editing") {
      if (event.key === "+" || event.key === "=") this.game.setEditQueueLength(1);
      if (event.key === "-" || event.key === "_") this.game.setEditQueueLength(-1);
      if (event.key.toLowerCase() === "g" && this.game.snapshot.editStatus !== "generating") {
        this.game.generateEditedPuzzle();
      }
      if (event.key === "Enter") this.game.playEditedPuzzle();
      if (event.key === "Escape") this.game.exitEditor();
    } else if (mode === "failed") {
      if (event.key === "Enter" || event.key === " ") this.game.retry();
    } else if (mode === "clear") {
      if (event.key === "Enter" || event.key === " ") this.game.advance();
    } else if (mode === "feed") {
      if (event.key === "Enter" || event.key === " ") this.game.startPlanning();
      if (event.key.toLowerCase() === "e") this.game.enterEditor();
    }
    if (event.key.toLowerCase() === "s") this.game.toggleSound();
    if (event.key.toLowerCase() === "c") this.game.copyShareUrl();
  };
}
