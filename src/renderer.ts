import { COLS, ROWS, type Cell, type GameSnapshot, type PieceKind, type Puzzle } from "./gameTypes";
import { absoluteCells } from "./pieces";
import { PIECE_COLORS, TOKENS, clearColorCache, resolveCssVar } from "./colors";

const CELL_HIGHLIGHT = "rgba(255, 255, 255, 0.45)";
const CELL_SHADOW = "rgba(0, 0, 0, 0.22)";

const FONT_PIXEL_BASE = '"Press Start 2P", "VT323", monospace';
const FONT_MONO_BASE = '"JetBrains Mono", "SF Mono", "Courier New", monospace';

const SCREEN_INSET = 12;

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  // 마지막 렌더의 보드 위치/셀 크기 (screenToColumn 변환용)
  private boardOx = 0;
  private boardOy = 0;
  private boardCell = 0;
  // 버튼 클릭 영역
  private editButton: { x: number; y: number; w: number; h: number } | null = null;
  private finishButton: { x: number; y: number; w: number; h: number } | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D is not available.");
    this.ctx = ctx;
    this.resize();
  }

  /** 화면 좌표를 보드 컬럼 인덱스로 변환 (planning 클릭 처리용) */
  screenToColumn(screenX: number, screenY: number): number | null {
    if (this.boardCell <= 0) return null;
    if (screenY < this.boardOy || screenY > this.boardOy + this.boardCell * ROWS) return null;
    const col = Math.floor((screenX - this.boardOx) / this.boardCell);
    if (col < 0 || col >= COLS) return null;
    return col;
  }

  /** 화면 좌표를 보드 셀 (col, row)로 변환. 보드 밖이면 null */
  screenToCell(screenX: number, screenY: number): { col: number; row: number } | null {
    if (this.boardCell <= 0) return null;
    const col = Math.floor((screenX - this.boardOx) / this.boardCell);
    const row = Math.floor((screenY - this.boardOy) / this.boardCell);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
    return { col, row };
  }

  /** 보드 셀 한 칸 픽셀 크기 (드래그 픽셀 → 컬럼 변환용) */
  getCellSize(): number {
    return this.boardCell;
  }

  /** 화면 좌표가 EDIT 버튼 위에 있으면 true */
  isEditButton(screenX: number, screenY: number): boolean {
    if (!this.editButton) return false;
    const b = this.editButton;
    return screenX >= b.x && screenX <= b.x + b.w && screenY >= b.y && screenY <= b.y + b.h;
  }

  /** 화면 좌표가 FINISH 버튼 위에 있으면 true */
  isFinishButton(screenX: number, screenY: number): boolean {
    if (!this.finishButton) return false;
    const b = this.finishButton;
    return screenX >= b.x && screenX <= b.x + b.w && screenY >= b.y && screenY <= b.y + b.h;
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.floor(window.innerWidth);
    this.height = Math.floor(window.innerHeight);
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    clearColorCache();
  }

  render(snapshot: GameSnapshot, now: number): void {
    this.background();
    this.renderTop(snapshot);
    const board = this.boardRect();
    if (snapshot.mode === "feed") {
      this.renderFeed(snapshot, board, now);
    } else if (snapshot.mode === "editing") {
      this.renderEditor(snapshot, board);
    } else {
      this.renderBoard(snapshot, board, now, true);
    }
    this.renderTouchTrail(snapshot);
    this.renderGestureHints(snapshot);
    this.renderOverlays(snapshot, now);
    this.renderToast(snapshot, now);
    this.renderScanlines();
  }

  private renderEditor(snapshot: GameSnapshot, board: DOMRect): void {
    const cell = Math.floor(Math.min(board.width / COLS, board.height / ROWS));
    const ox = board.x + (board.width - cell * COLS) / 2;
    const oy = board.y + (board.height - cell * ROWS) / 2;
    const boardW = cell * COLS;
    const boardH = cell * ROWS;
    this.boardOx = ox;
    this.boardOy = oy;
    this.boardCell = cell;

    // 보드 배경 (크림)
    this.ctx.fillStyle = resolveCssVar(TOKENS.bgBoard);
    this.ctx.fillRect(ox, oy, boardW, boardH);

    // 그리드 (편집 모드에서는 더 진하게 — 셀 경계 명확)
    this.ctx.strokeStyle = "rgba(26, 26, 46, 0.18)";
    this.ctx.lineWidth = 1;
    for (let x = 1; x < COLS; x += 1) {
      this.line(ox + x * cell + 0.5, oy, ox + x * cell + 0.5, oy + boardH);
    }
    for (let y = 1; y < ROWS; y += 1) {
      this.line(ox, oy + y * cell + 0.5, ox + boardW, oy + y * cell + 0.5);
    }

    // editGrid 셀 그리기 (모두 garbage 컬러)
    snapshot.editGrid.forEach((row, y) => {
      row.forEach((c, x) => {
        if (c) this.drawCell(ox, oy, cell, x, y, "garbage", 1, false);
      });
    });

    // 외곽선
    this.pixelStroke(ox, oy, boardW, boardH, 3, resolveCssVar(TOKENS.ink));
  }

  private renderTouchTrail(snapshot: GameSnapshot): void {
    const trail = snapshot.animation.touchTrail;
    if (!trail || trail.length < 2) return;
    this.ctx.save();
    // 점들을 잇는 선 (얇은 ink-soft 색)
    this.ctx.strokeStyle = resolveCssVar(TOKENS.inkSoft);
    this.ctx.lineWidth = 2;
    this.ctx.globalAlpha = 0.5;
    this.ctx.beginPath();
    this.ctx.moveTo(trail[0].x, trail[0].y);
    for (let i = 1; i < trail.length; i += 1) {
      this.ctx.lineTo(trail[i].x, trail[i].y);
    }
    this.ctx.stroke();
    // 끝점 강조 (현재 손가락 위치)
    const last = trail[trail.length - 1];
    this.ctx.globalAlpha = 0.9;
    this.ctx.fillStyle = resolveCssVar(TOKENS.accent);
    this.ctx.beginPath();
    this.ctx.arc(last.x, last.y, 5, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  private renderToast(snapshot: GameSnapshot, now: number): void {
    const TOAST_MS = 1500;
    if (!snapshot.animation.toast || snapshot.animation.toastAt === 0) return;
    const age = now - snapshot.animation.toastAt;
    if (age > TOAST_MS) return;
    const fadeStart = TOAST_MS - 300;
    const alpha = age < fadeStart ? 1 : 1 - (age - fadeStart) / 300;

    const screen = this.screenRect();
    const text = snapshot.animation.toast;
    this.ctx.save();
    this.ctx.font = `10px ${FONT_PIXEL_BASE}`;
    const textW = this.ctx.measureText(text).width;
    const padX = 14;
    const boxW = textW + padX * 2;
    const boxH = 26;
    const boxX = screen.x + (screen.width - boxW) / 2;
    const boxY = screen.y + 56;

    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = resolveCssVar(TOKENS.bgPanel);
    this.ctx.fillRect(boxX, boxY, boxW, boxH);
    this.pixelStroke(boxX, boxY, boxW, boxH, 2, resolveCssVar(TOKENS.ink));
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillStyle = resolveCssVar(TOKENS.ink);
    this.ctx.fillText(text, boxX + boxW / 2, boxY + boxH / 2);
    this.ctx.globalAlpha = 1;
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "alphabetic";
    this.ctx.restore();
  }

  private background(): void {
    this.ctx.fillStyle = resolveCssVar(TOKENS.bgFrame);
    this.ctx.fillRect(0, 0, this.width, this.height);

    const screen = this.screenRect();
    this.ctx.fillStyle = resolveCssVar(TOKENS.bgScreen);
    this.ctx.fillRect(screen.x, screen.y, screen.width, screen.height);

    this.ctx.strokeStyle = resolveCssVar(TOKENS.ink);
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(
      Math.floor(screen.x) + 1.5,
      Math.floor(screen.y) + 1.5,
      Math.floor(screen.width) - 3,
      Math.floor(screen.height) - 3,
    );
  }

  private renderScanlines(): void {
    const screen = this.screenRect();
    this.ctx.save();
    this.ctx.globalAlpha = 0.05;
    this.ctx.fillStyle = resolveCssVar(TOKENS.ink);
    for (let y = screen.y; y < screen.y + screen.height; y += 3) {
      this.ctx.fillRect(screen.x, y, screen.width, 1);
    }
    this.ctx.restore();
  }

  private renderTop(snapshot: GameSnapshot): void {
    const screen = this.screenRect();
    const top = screen.y + 8;
    this.ctx.font = `${10}px ${FONT_PIXEL_BASE}`;
    this.ctx.textBaseline = "middle";
    this.ctx.textAlign = "left";

    if (snapshot.mode === "editing") {
      // 에디터 모드 라벨
      this.ctx.fillStyle = resolveCssVar(TOKENS.inkSoft);
      this.ctx.fillText("EDIT", screen.x + 14, top + 8);
      this.ctx.fillText("QUEUE", screen.x + screen.width - 80, top + 8);

      this.ctx.font = `bold 18px ${FONT_MONO_BASE}`;
      this.ctx.fillStyle = resolveCssVar(TOKENS.ink);
      const cellsFilled = snapshot.editGrid.flat().filter((c) => c !== null).length;
      this.ctx.fillText(`${cellsFilled} CELLS`, screen.x + 14, top + 26);

      this.ctx.textAlign = "right";
      const statusColor =
        snapshot.editStatus === "ready"
          ? resolveCssVar(TOKENS.success)
          : snapshot.editStatus === "no-solution"
            ? resolveCssVar(TOKENS.danger)
            : resolveCssVar(TOKENS.ink);
      this.ctx.fillStyle = statusColor;
      this.ctx.fillText(this.padNumber(snapshot.editQueueLength, 2), screen.x + screen.width - 14, top + 26);
      this.ctx.textAlign = "left";

      this.ctx.strokeStyle = resolveCssVar(TOKENS.ink);
      this.ctx.lineWidth = 1;
      this.line(screen.x + 12, top + 44, screen.x + screen.width - 12, top + 44);
      return;
    }

    this.ctx.fillStyle = resolveCssVar(TOKENS.inkSoft);
    this.ctx.fillText("PIECES", screen.x + 14, top + 8);
    this.ctx.fillText("TRY", screen.x + screen.width - 80, top + 8);

    this.ctx.font = `bold 18px ${FONT_MONO_BASE}`;
    this.ctx.fillStyle = resolveCssVar(TOKENS.ink);
    const total = snapshot.puzzle.queue.length;
    const placed = snapshot.queueIndex;
    this.ctx.fillText(`${placed}/${total}`, screen.x + 14, top + 26);

    this.ctx.textAlign = "right";
    const tries = snapshot.attempts + (snapshot.mode === "planning" ? 1 : 0);
    this.ctx.fillStyle = tries > 1 ? resolveCssVar(TOKENS.danger) : resolveCssVar(TOKENS.ink);
    this.ctx.fillText(this.padNumber(Math.max(1, tries), 2), screen.x + screen.width - 14, top + 26);
    this.ctx.textAlign = "left";

    this.ctx.strokeStyle = resolveCssVar(TOKENS.ink);
    this.ctx.lineWidth = 1;
    this.line(screen.x + 12, top + 44, screen.x + screen.width - 12, top + 44);
  }

  private renderFeed(snapshot: GameSnapshot, board: DOMRect, now: number): void {
    const easedY = this.easeOut(snapshot.animation.feedSlide);
    const amountY = Math.abs(easedY);
    const amountX = this.easeOut(snapshot.animation.feedSlideX);
    const directionY = Math.sign(easedY) || 1;
    const slide = directionY * amountY * this.height * 0.82;
    const slideX = amountX * this.width * 0.82;
    const shake = snapshot.animation.feedShake > 0.02 ? Math.sin(now * 0.08) * snapshot.animation.feedShake * 6 : 0;
    const base = new DOMRect(board.x + board.width * 0.04, board.y, board.width * 0.92, board.height * 0.94);
    const preview = new DOMRect(base.x + slideX + shake, base.y + slide, base.width, base.height);

    if (snapshot.animation.previousPuzzle && snapshot.animation.previousGrid && (amountY > 0.02 || Math.abs(amountX) > 0.02)) {
      const oldY = base.y - directionY * (1 - amountY) * this.height * 0.82;
      const oldX = base.x - Math.sign(amountX) * (1 - Math.abs(amountX)) * this.width * 0.82;
      const outgoing = new DOMRect(amountY > 0.02 ? base.x : oldX, amountY > 0.02 ? oldY : base.y, base.width, base.height);
      this.renderFeedCard(snapshot, snapshot.animation.previousPuzzle, snapshot.animation.previousGrid, outgoing, now, 0.78 + amountY * 0.22);
    }

    this.renderFeedCard(snapshot, snapshot.puzzle, snapshot.grid, preview, now, 1);
  }

  private renderFeedCard(snapshot: GameSnapshot, puzzle: Puzzle, grid: Cell[][], preview: DOMRect, now: number, alpha: number): void {
    this.ctx.save();
    this.ctx.globalAlpha = alpha;

    this.ctx.fillStyle = resolveCssVar(TOKENS.bgPanel);
    this.ctx.fillRect(preview.x, preview.y, preview.width, preview.height);
    this.pixelStroke(preview.x, preview.y, preview.width, preview.height, 2, resolveCssVar(TOKENS.ink));

    this.renderBoard(
      { ...snapshot, puzzle, grid, current: null, next: null },
      this.innerRect(preview, 16),
      now,
      false,
    );

    this.ctx.textAlign = "center";
    this.ctx.font = `16px ${FONT_PIXEL_BASE}`;
    this.ctx.fillStyle = resolveCssVar(TOKENS.ink);
    this.ctx.fillText(puzzle.difficulty.toUpperCase(), preview.x + preview.width / 2, preview.y + preview.height - 76);

    this.ctx.font = `8px ${FONT_PIXEL_BASE}`;
    this.ctx.fillStyle = resolveCssVar(TOKENS.inkSoft);
    this.ctx.fillText("TAP START   UP NEXT   DOWN PREV", preview.x + preview.width / 2, preview.y + preview.height - 50);
    const challengeHint = puzzle.difficulty === "Challenge" ? "SWIPE RIGHT BACK" : "SWIPE LEFT CHALLENGE";
    this.ctx.fillText(challengeHint, preview.x + preview.width / 2, preview.y + preview.height - 30);
    this.ctx.textAlign = "left";
    this.ctx.restore();
  }

  private renderBoard(snapshot: GameSnapshot, board: DOMRect, now: number, active: boolean): void {
    const cell = Math.floor(Math.min(board.width / COLS, board.height / ROWS));
    const ox = board.x + (board.width - cell * COLS) / 2;
    const oy = board.y + (board.height - cell * ROWS) / 2;
    const boardW = cell * COLS;
    const boardH = cell * ROWS;
    if (active) {
      this.boardOx = ox;
      this.boardOy = oy;
      this.boardCell = cell;
    }
    const lockPulse = Math.max(0, 1 - (now - snapshot.animation.landedAt) / 120);

    // 보드 배경 (크림)
    this.ctx.fillStyle = resolveCssVar(TOKENS.bgBoard);
    this.ctx.fillRect(ox, oy, boardW, boardH);

    // 미세 그리드
    this.ctx.strokeStyle = "rgba(26, 26, 46, 0.08)";
    this.ctx.lineWidth = 1;
    for (let x = 1; x < COLS; x += 1) {
      this.line(ox + x * cell + 0.5, oy, ox + x * cell + 0.5, oy + boardH);
    }
    for (let y = 1; y < ROWS; y += 1) {
      this.line(ox, oy + y * cell + 0.5, ox + boardW, oy + y * cell + 0.5);
    }

    // 잠긴 셀
    snapshot.grid.forEach((row, y) => {
      row.forEach((kind, x) => {
        if (kind) this.drawCell(ox, oy, cell, x, y, kind, 1, false);
      });
    });

    // 라인 클리어 플래시 (steps 느낌으로 0/1 alpha)
    const clearingAge = now - snapshot.animation.clearStartedAt;
    if (clearingAge < 240) {
      const phase = Math.floor(clearingAge / 50) % 2;
      if (phase === 0) {
        this.ctx.fillStyle = resolveCssVar(TOKENS.success);
        snapshot.animation.clearingRows.forEach((row) => {
          this.ctx.fillRect(ox, oy + row * cell, boardW, cell);
        });
      }
    }

    // Planning 모드: 떨어질 위치 ghost (반투명)
    if (active && snapshot.ghostCells && snapshot.current) {
      const kind = snapshot.current.kind;
      snapshot.ghostCells.forEach((point) => {
        this.drawCell(ox, oy, cell, point.x, point.y, kind, 0.42, false);
      });
    }

    // 현재 피스 (실제 위치)
    if (snapshot.current) {
      const cells = absoluteCells(snapshot.current);
      cells.forEach((point) => this.drawCell(ox, oy, cell, point.x, point.y, snapshot.current!.kind, 1, lockPulse > 0));
    }

    // 보드 외곽선 (3px solid ink) — 셀을 가리도록 마지막에 그림
    this.pixelStroke(ox, oy, boardW, boardH, active ? 3 : 2, resolveCssVar(TOKENS.ink));

    if (active) this.renderNext(snapshot, ox, oy, cell, boardW);
  }

  private drawCell(
    ox: number,
    oy: number,
    size: number,
    x: number,
    y: number,
    kind: PieceKind | "garbage" | "wall",
    alpha: number,
    landed: boolean,
  ): void {
    if (y < 0) return;
    const px = ox + x * size;
    const py = oy + y * size + (landed && kind !== "wall" ? 1 : 0);
    const colors = PIECE_COLORS[kind];
    this.ctx.globalAlpha = alpha;

    const fill = resolveCssVar(colors.fill);
    const stroke = resolveCssVar(colors.stroke);

    if (kind === "wall") {
      // 벽: 평평한 단단한 블록 (3D 효과 없음, 외곽선만)
      this.ctx.fillStyle = fill;
      this.ctx.fillRect(px, py, size, size);
      this.ctx.strokeStyle = stroke;
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
      this.ctx.globalAlpha = 1;
      return;
    }

    // 본체
    this.ctx.fillStyle = fill;
    this.ctx.fillRect(px + 1, py + 1, size - 2, size - 2);

    // 위/왼쪽 하이라이트 (1px)
    this.ctx.fillStyle = CELL_HIGHLIGHT;
    this.ctx.fillRect(px + 1, py + 1, size - 2, 1);
    this.ctx.fillRect(px + 1, py + 1, 1, size - 2);

    // 아래/오른쪽 음영 (1px)
    this.ctx.fillStyle = CELL_SHADOW;
    this.ctx.fillRect(px + 1, py + size - 2, size - 2, 1);
    this.ctx.fillRect(px + size - 2, py + 1, 1, size - 2);

    // 외곽선 (1px piece-dark)
    this.ctx.strokeStyle = stroke;
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);

    this.ctx.globalAlpha = 1;
  }

  private renderNext(snapshot: GameSnapshot, ox: number, _oy: number, _cell: number, boardW: number): void {
    const screen = this.screenRect();
    const labelY = screen.y + 8 + 60;
    this.ctx.textAlign = "right";
    this.ctx.font = `8px ${FONT_PIXEL_BASE}`;
    this.ctx.fillStyle = resolveCssVar(TOKENS.inkSoft);
    this.ctx.fillText("NEXT", ox + boardW, labelY);
    if (snapshot.next) {
      const colors = PIECE_COLORS[snapshot.next];
      this.ctx.font = `bold 14px ${FONT_MONO_BASE}`;
      this.ctx.fillStyle = resolveCssVar(colors.stroke);
      this.ctx.fillText(snapshot.next, ox + boardW, labelY + 16);
    }
    this.ctx.textAlign = "left";
  }

  private renderGestureHints(snapshot: GameSnapshot): void {
    this.editButton = null;
    this.finishButton = null;

    if (snapshot.mode === "planning") {
      const screen = this.screenRect();
      this.ctx.save();
      this.ctx.globalAlpha = 0.6;
      this.ctx.textAlign = "center";
      this.ctx.font = `8px ${FONT_PIXEL_BASE}`;
      this.ctx.fillStyle = resolveCssVar(TOKENS.inkMute);
      this.ctx.fillText(
        "DRAG MOVE   TAP ROTATE   ↓ DROP   ↑ QUIT   U UNDO",
        screen.x + screen.width / 2,
        screen.y + screen.height - 14,
      );
      this.ctx.restore();
      this.ctx.textAlign = "left";
      return;
    }

    if (snapshot.mode === "editing") {
      const screen = this.screenRect();

      // 상태 라벨 (배너)
      let statusLine = "TAP CELL TO TOGGLE";
      let statusColor: string = TOKENS.inkSoft;
      if (snapshot.editStatus === "generating") {
        statusLine = "SOLVING — PLEASE WAIT";
        statusColor = TOKENS.info;
      } else if (snapshot.editStatus === "ready") {
        statusLine = `READY — ${snapshot.editFoundQueue?.join(" ")}`;
        statusColor = TOKENS.success;
      } else if (snapshot.editStatus === "no-solution") {
        statusLine = "NO SOLUTION — EDIT BOARD";
        statusColor = TOKENS.danger;
      }

      this.ctx.save();
      this.ctx.textAlign = "center";
      this.ctx.font = `9px ${FONT_PIXEL_BASE}`;
      this.ctx.fillStyle = resolveCssVar(statusColor);
      this.ctx.fillText(statusLine, screen.x + screen.width / 2, screen.y + screen.height - 60);

      // FINISH/GENERATE 버튼 (mode-aware)
      const btnW = 160;
      const btnH = 34;
      const btnX = screen.x + (screen.width - btnW) / 2;
      const btnY = screen.y + screen.height - btnH - 18;
      this.finishButton = { x: btnX, y: btnY, w: btnW, h: btnH };

      const ready = snapshot.editStatus === "ready";
      const generating = snapshot.editStatus === "generating";
      // 생성 중: 회색 배경 + 점멸하는 점들
      const fillColor = generating
        ? resolveCssVar(TOKENS.bgPanel)
        : ready
          ? resolveCssVar(TOKENS.success)
          : resolveCssVar(TOKENS.accent);
      this.ctx.fillStyle = fillColor;
      this.ctx.fillRect(btnX, btnY, btnW, btnH);
      this.pixelStroke(btnX, btnY, btnW, btnH, 2, resolveCssVar(TOKENS.ink));
      this.ctx.font = `bold 12px ${FONT_PIXEL_BASE}`;
      this.ctx.textBaseline = "middle";
      this.ctx.fillStyle = generating
        ? resolveCssVar(TOKENS.inkMute)
        : resolveCssVar(TOKENS.bgPanel);
      let label: string;
      if (generating) {
        // 점멸 점: . / .. / ... 으로 진행감
        const dots = ".".repeat((Math.floor(performance.now() / 250) % 3) + 1);
        label = `GENERATING${dots}`;
      } else if (ready) {
        label = "▶ FINISH";
      } else {
        label = "GENERATE";
      }
      this.ctx.fillText(label, btnX + btnW / 2, btnY + btnH / 2);

      // 키보드 단축키 힌트 (작게)
      this.ctx.globalAlpha = 0.5;
      this.ctx.textBaseline = "alphabetic";
      this.ctx.font = `8px ${FONT_PIXEL_BASE}`;
      this.ctx.fillStyle = resolveCssVar(TOKENS.inkMute);
      this.ctx.fillText(
        "+/- LENGTH   ESC EXIT",
        screen.x + screen.width / 2,
        btnY - 22,
      );
      this.ctx.restore();
      this.ctx.textAlign = "left";
      return;
    }

    if (snapshot.mode === "feed") {
      const screen = this.screenRect();

      // EDIT 버튼 (하단 우측)
      const btnW = 90;
      const btnH = 28;
      const btnX = screen.x + screen.width - btnW - 12;
      const btnY = screen.y + screen.height - btnH - 8;
      this.editButton = { x: btnX, y: btnY, w: btnW, h: btnH };

      this.ctx.save();
      this.ctx.fillStyle = resolveCssVar(TOKENS.bgPanel);
      this.ctx.fillRect(btnX, btnY, btnW, btnH);
      this.pixelStroke(btnX, btnY, btnW, btnH, 2, resolveCssVar(TOKENS.ink));
      this.ctx.font = `bold 10px ${FONT_PIXEL_BASE}`;
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.fillStyle = resolveCssVar(TOKENS.ink);
      this.ctx.fillText("✎ EDIT", btnX + btnW / 2, btnY + btnH / 2);
      this.ctx.restore();
      this.ctx.textAlign = "left";
      this.ctx.textBaseline = "alphabetic";
    }
  }

  private renderOverlays(snapshot: GameSnapshot, now: number): void {
    if (snapshot.mode !== "clear" && snapshot.mode !== "failed") return;
    const age = now - snapshot.animation.messageStartedAt;
    const alpha = Math.max(0, Math.min(1, 1 - Math.max(0, age - 1200) / 600));

    // 배경 dim
    this.ctx.globalAlpha = alpha * 0.55;
    this.ctx.fillStyle = resolveCssVar(TOKENS.ink);
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.ctx.globalAlpha = alpha;

    // 모달 박스
    const boxW = Math.min(this.width - 64, 320);
    const boxH = 140;
    const boxX = (this.width - boxW) / 2;
    const boxY = this.height * 0.4;

    this.ctx.fillStyle = resolveCssVar(TOKENS.bgPanel);
    this.ctx.fillRect(boxX, boxY, boxW, boxH);
    this.pixelStroke(boxX, boxY, boxW, boxH, 3, resolveCssVar(TOKENS.ink));

    // 메인 메시지 (게임 오버 깜빡임)
    const blink = snapshot.mode === "failed" && Math.floor(now / 200) % 2 === 0;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.font = `24px ${FONT_PIXEL_BASE}`;
    this.ctx.fillStyle =
      snapshot.mode === "clear"
        ? resolveCssVar(TOKENS.success)
        : blink
          ? resolveCssVar(TOKENS.danger)
          : resolveCssVar(TOKENS.ink);
    this.ctx.fillText(snapshot.animation.message, this.width / 2, boxY + 50);

    // 서브 텍스트
    this.ctx.font = `10px ${FONT_PIXEL_BASE}`;
    this.ctx.fillStyle = resolveCssVar(TOKENS.inkSoft);
    const subText =
      snapshot.mode === "clear"
        ? "TAP NEXT PUZZLE"
        : "TAP TRY AGAIN";
    this.ctx.fillText(subText, this.width / 2, boxY + 100);

    this.ctx.globalAlpha = 1;
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "alphabetic";
  }

  private screenRect(): DOMRect {
    const top = this.safeTop() + SCREEN_INSET;
    const bottom = this.height - this.safeBottom() - SCREEN_INSET;
    const left = SCREEN_INSET;
    const right = this.width - SCREEN_INSET;
    return new DOMRect(left, top, right - left, bottom - top);
  }

  private boardRect(): DOMRect {
    const screen = this.screenRect();
    const top = screen.y + 60;
    const bottom = screen.y + screen.height - 28;
    return new DOMRect(screen.x, top, screen.width, bottom - top);
  }

  private innerRect(rect: DOMRect, pad: number): DOMRect {
    return new DOMRect(rect.x + pad, rect.y + pad, rect.width - pad * 2, rect.height - pad * 2 - 84);
  }

  private easeOut(value: number): number {
    const sign = Math.sign(value);
    const amount = Math.min(1, Math.abs(value));
    return sign * (1 - (1 - amount) * (1 - amount));
  }

  private safeTop(): number {
    return Math.max(8, Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue("--sat")) || 0);
  }

  private safeBottom(): number {
    return Math.max(0, Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue("--sab")) || 0);
  }

  private pixelStroke(x: number, y: number, w: number, h: number, weight: number, color: string): void {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = weight;
    const offset = weight / 2;
    this.ctx.strokeRect(
      Math.floor(x) + offset,
      Math.floor(y) + offset,
      Math.floor(w) - weight,
      Math.floor(h) - weight,
    );
  }

  private line(x1: number, y1: number, x2: number, y2: number): void {
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
  }

  private padNumber(value: number, width: number): string {
    return value.toString().padStart(width, "0");
  }
}
