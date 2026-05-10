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

  private onLeave = (): void => {
    // 마우스가 캔버스 밖으로 나가면 hover 정리
    this.game.setEditHoverPos(null);
  };

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
    };
    // 컨트롤 버튼 누름 상태 (시각 피드백)
    if (this.game.snapshot.mode === "planning") {
      const action = this.renderer.screenToControl(event.clientX, event.clientY);
      if (action) this.game.setPressedControl(action);
    }
  };

  private onMove = (event: PointerEvent): void => {
    const mode = this.game.snapshot.mode;
    // 마우스(호버) — 활성 터치 없어도 호버 갱신
    if (event.pointerType !== "touch" && mode === "editing") {
      const cell = this.renderer.screenToCell(event.clientX, event.clientY);
      this.game.setEditHoverPos(cell ? { col: cell.col, row: cell.row } : null);
    }

    if (!this.touch || this.touch.id !== event.pointerId) return;

    if (mode === "planning") {
      const dx = event.clientX - this.touch.startX;
      const cellSize = this.renderer.getCellSize();
      if (cellSize > 0) {
        const colDelta = Math.round(dx / cellSize);
        const targetCol = this.touch.pieceStartX + colDelta;
        this.game.setPieceColumn(targetCol);
      }
    } else if (mode === "editing") {
      // 터치 드래그 시 호버 위치 따라옴
      const cell = this.renderer.screenToCell(event.clientX, event.clientY);
      this.game.setEditHoverPos(cell ? { col: cell.col, row: cell.row } : null);
    }

    this.touch.lastX = event.clientX;
  };

  private onUp = (event: PointerEvent): void => {
    event.preventDefault();
    // 누름 상태 해제 (모드 무관)
    this.game.setPressedControl(null);
    if (!this.touch || this.touch.id !== event.pointerId) return;
    const dx = event.clientX - this.touch.startX;
    const dy = event.clientY - this.touch.startY;
    const elapsed = performance.now() - this.touch.startedAt;
    const mode = this.game.snapshot.mode;
    const isTap = Math.abs(dx) < 18 && Math.abs(dy) < 18 && elapsed < 320;

    if (mode === "planning") {
      if (isTap) {
        // 우선순위: 상단 버튼 (quit/retry) > 컨트롤 버튼 > 회전 폴백
        if (this.renderer.isQuitButton(event.clientX, event.clientY)) {
          this.game.abandon();
        } else if (this.renderer.isRetryButton(event.clientX, event.clientY)) {
          this.game.retry();
        } else {
          const action = this.renderer.screenToControl(event.clientX, event.clientY);
          if (action) {
            switch (action) {
              case "left": this.game.moveCurrent(-1); break;
              case "right": this.game.moveCurrent(1); break;
              case "rotate": this.game.rotateCurrent(); break;
              case "down": this.game.dropOrLock(); break;
              case "hardDrop": this.game.dropCurrent(); break;
            }
          } else {
            this.game.rotateCurrent();
          }
        }
      }
    } else if (mode === "editing") {
      if (isTap) {
        // 우선순위: FINISH > D-pad 버튼 (planning 과 공유)
        if (this.renderer.isFinishButton(event.clientX, event.clientY)) {
          const status = this.game.snapshot.editStatus;
          if (status === "ready") {
            this.game.playEditedPuzzle();
          } else if (status !== "generating") {
            this.game.generateEditedPuzzle();
          }
        } else {
          const action = this.renderer.screenToControl(event.clientX, event.clientY);
          if (action) {
            switch (action) {
              case "left": this.game.editMoveCurrent(-1); break;
              case "right": this.game.editMoveCurrent(1); break;
              case "rotate": this.game.editRotateCurrent(); break;
              case "down": this.game.editSoftDrop(); break;
              case "hardDrop": this.game.editHardDrop(); break;
            }
          }
        }
      }
    } else if (mode === "feed") {
      // 위 스와이프 → 무작위 난이도 셔플 (탭은 startPlanning)
      if (!isTap && dy < -60 && Math.abs(dy) > Math.abs(dx) * 1.15) {
        this.game.shuffleFeed();
      } else if (isTap) {
        if (this.renderer.isEditButton(event.clientX, event.clientY)) {
          this.game.enterEditor();
        } else {
          this.game.startPlanning();
        }
      }
    } else if (mode === "failed") {
      if (isTap) this.game.retry();
    } else if (mode === "clear") {
      if (isTap) {
        if (this.renderer.isShareResultButton(event.clientX, event.clientY)) {
          this.game.copyResultShare();
        } else {
          this.game.advance();
        }
      }
    }
    this.touch = null;
  };

  private onCancel = (event: PointerEvent): void => {
    if (this.touch?.id === event.pointerId) {
      this.touch = null;
      this.game.setEditHoverPos(null);
      this.game.setPressedControl(null);
    }
  };

  private onKey = (event: KeyboardEvent): void => {
    const mode = this.game.snapshot.mode;
    if (mode === "planning") {
      if (event.key === "ArrowLeft") this.game.moveCurrent(-1);
      if (event.key === "ArrowRight") this.game.moveCurrent(1);
      if (event.key === "ArrowUp" || event.key.toLowerCase() === "r") {
        this.game.rotateCurrent();
      }
      // 슬라이드 (잠금 안 함, 슬라이드 후 좌/우/회전 가능)
      if (event.key === "ArrowDown") this.game.slideToFloor();
      // 하드 드롭 (잠금)
      if (event.key === "Enter" || event.key === " ") this.game.dropCurrent();
      if (event.key === "Backspace" || event.key.toLowerCase() === "u") {
        this.game.undoLastPlacement();
      }
      if (event.key === "Escape") this.game.abandon();
    } else if (mode === "editing") {
      // D-pad 키보드 단축키
      if (event.key === "ArrowLeft") this.game.editMoveCurrent(-1);
      if (event.key === "ArrowRight") this.game.editMoveCurrent(1);
      if (event.key === "ArrowDown") this.game.editSoftDrop();
      if (event.key === "ArrowUp" || event.key.toLowerCase() === "r") this.game.editRotateCurrent();
      if (event.key === " ") this.game.editHardDrop();
      // 큐 길이 (+/-) / 타겟 라인 ([])
      if (event.key === "+" || event.key === "=") this.game.setEditQueueLength(1);
      if (event.key === "-" || event.key === "_") this.game.setEditQueueLength(-1);
      if (event.key === "]" || event.key === "}") this.game.setEditTargetLines(1);
      if (event.key === "[" || event.key === "{") this.game.setEditTargetLines(-1);
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
