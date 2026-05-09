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
      trail: [{ x: event.clientX, y: event.clientY }],
    };
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
      // 컨트롤 버튼이 가장 우선 (제스처보다 명시적 탭이 정확함)
      if (isTap) {
        const action = this.renderer.screenToControl(event.clientX, event.clientY);
        if (action) {
          switch (action) {
            case "left": this.game.moveCurrent(-1); break;
            case "right": this.game.moveCurrent(1); break;
            case "rotate": this.game.rotateCurrent(); break;
            case "down": this.game.dropOrLock(); break;
          }
          this.game.setTouchTrail([]);
          this.touch = null;
          return;
        }
      }
      if (vertical && dy > 110) {
        this.game.dropCurrent();
      } else if (vertical && dy > 40) {
        this.game.slideToFloor();
      } else if (vertical && dy < -60) {
        this.game.abandon();
      } else if (isTap) {
        this.game.rotateCurrent();
      }
      this.game.setTouchTrail([]);
    } else if (mode === "editing") {
      if (isTap) {
        // 우선순위: FINISH > ROTATE > 툴바 > 보드 셀
        if (this.renderer.isFinishButton(event.clientX, event.clientY)) {
          const status = this.game.snapshot.editStatus;
          if (status === "ready") {
            this.game.playEditedPuzzle();
          } else if (status !== "generating") {
            this.game.generateEditedPuzzle();
          }
        } else if (this.renderer.isEditRotateButton(event.clientX, event.clientY)) {
          this.game.rotateEditTool();
        } else {
          const tool = this.renderer.screenToTool(event.clientX, event.clientY);
          if (tool !== null) {
            // 같은 도구 재탭 = 회전 (모바일 친화적)
            if (tool === this.game.snapshot.editTool && tool !== "cell") {
              this.game.rotateEditTool();
            } else {
              this.game.setEditTool(tool);
            }
          } else {
            const cell = this.renderer.screenToCell(event.clientX, event.clientY);
            if (cell) this.game.editPlaceAt(cell.col, cell.row);
          }
        }
      }
      // 터치 종료 시 hover 정리 (터치는 hover 개념 없으니)
      if (event.pointerType === "touch") {
        this.game.setEditHoverPos(null);
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
      this.game.setEditHoverPos(null);
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
      if (event.key === "+" || event.key === "=") this.game.setEditQueueLength(1);
      if (event.key === "-" || event.key === "_") this.game.setEditQueueLength(-1);
      if (event.key.toLowerCase() === "r") this.game.rotateEditTool();
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
