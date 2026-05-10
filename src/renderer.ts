import { COLS, ROWS, type Cell, type GameSnapshot, type PieceKind, type Puzzle } from "./gameTypes";

export type PlanningControl = "left" | "right" | "rotate" | "down" | "hardDrop";
import { absoluteCells, createPiece } from "./pieces";
import { PIECE_COLORS, TOKENS, clearColorCache, resolveCssVar } from "./colors";

const CELL_HIGHLIGHT = "rgba(255, 255, 255, 0.45)";
const CELL_SHADOW = "rgba(0, 0, 0, 0.22)";

const FONT_PIXEL_BASE = '"Press Start 2P", "VT323", monospace';
const FONT_MONO_BASE = '"JetBrains Mono", "SF Mono", "Courier New", monospace';

const SCREEN_INSET = 6;

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
  // 클리어 오버레이 SHARE 버튼
  private shareResultButton: { x: number; y: number; w: number; h: number } | null = null;
  // 에디터 도구 박스 클릭 영역
  // 에디터 회전 버튼 클릭 영역
  private editRotateButton: { x: number; y: number; w: number; h: number } | null = null;
  // Planning 모드 D-pad 버튼 (left/rotate/right/slide/lock)
  private controlButtons: Array<{ x: number; y: number; w: number; h: number; action: PlanningControl }> = [];
  // Planning 모드 상단 버튼 (quit / retry)
  private quitButton: { x: number; y: number; w: number; h: number } | null = null;
  private retryButton: { x: number; y: number; w: number; h: number } | null = null;

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

  /** 화면 좌표가 SHARE RESULT 버튼 위에 있으면 true */
  isShareResultButton(screenX: number, screenY: number): boolean {
    if (!this.shareResultButton) return false;
    const b = this.shareResultButton;
    return screenX >= b.x && screenX <= b.x + b.w && screenY >= b.y && screenY <= b.y + b.h;
  }


  /** 화면 좌표가 회전 버튼 위에 있으면 true */
  isEditRotateButton(screenX: number, screenY: number): boolean {
    if (!this.editRotateButton) return false;
    const b = this.editRotateButton;
    return screenX >= b.x && screenX <= b.x + b.w && screenY >= b.y && screenY <= b.y + b.h;
  }

  /** 화면 좌표가 QUIT 버튼 위에 있으면 true */
  isQuitButton(screenX: number, screenY: number): boolean {
    if (!this.quitButton) return false;
    const b = this.quitButton;
    return screenX >= b.x && screenX <= b.x + b.w && screenY >= b.y && screenY <= b.y + b.h;
  }

  /** 화면 좌표가 RETRY 버튼 위에 있으면 true */
  isRetryButton(screenX: number, screenY: number): boolean {
    if (!this.retryButton) return false;
    const b = this.retryButton;
    return screenX >= b.x && screenX <= b.x + b.w && screenY >= b.y && screenY <= b.y + b.h;
  }

  /** 화면 좌표가 planning 컨트롤 버튼 위에 있으면 그 액션, 아니면 null */
  screenToControl(screenX: number, screenY: number): PlanningControl | null {
    for (const b of this.controlButtons) {
      if (screenX >= b.x && screenX <= b.x + b.w && screenY >= b.y && screenY <= b.y + b.h) {
        return b.action;
      }
    }
    return null;
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
    let board = this.boardRect();
    // Planning 모드 Layout B:
    //   header → mission → [BOARD | 큐 우측 세로] → ◀↻▼▶ 단일 행
    if (snapshot.mode === "planning") {
      const missionGap = 4;          // 헤더 간소화로 mission 위로 올라감 → gap 축소
      const queueColumnWidth = 44;
      const controlsHeight = 76;
      const leftPad = 6;             // 필드 좌측 여백
      board = new DOMRect(
        board.x + leftPad,
        board.y + missionGap,
        Math.max(120, board.width - leftPad - queueColumnWidth - 12),
        Math.max(80, board.height - missionGap - controlsHeight),
      );
    }
    if (snapshot.mode === "feed") {
      this.renderFeed(snapshot, board, now);
    } else if (snapshot.mode === "editing") {
      this.renderEditor(snapshot, board);
    } else {
      this.renderBoard(snapshot, board, now, true);
    }
    if (snapshot.mode === "planning") {
      // Layout B: 큐 카드는 보드 우측 세로 스택
      this.renderQueueCards(snapshot, board);
      // 버튼: 보드 BELOW (단일 행)
      this.renderControlButtons(snapshot, board.y + board.height + 10);
    } else {
      this.controlButtons = [];
    }
    this.renderGestureHints(snapshot);
    this.renderOverlays(snapshot, now);
    this.renderToast(snapshot, now);
    this.renderScanlines();
  }

  /** Planning 모드 큐 카드 — Layout B: 보드 우측 세로 스택 (used / current / future 상태) */
  private renderQueueCards(snapshot: GameSnapshot, board: DOMRect): void {
    const queue = snapshot.puzzle.queue;
    if (queue.length === 0) return;
    const screen = this.screenRect();
    const gap = 4;
    const slotX = board.x + board.width + 8;
    const slotW = Math.max(28, Math.min(40, screen.x + screen.width - slotX - 4));
    // 필드 시각적 상단/높이 (renderBoard 의 oy/cell 기준 — board rect 가 아닌 실제 셀 영역)
    const fieldTop = this.boardOy;
    const fieldHeight = this.boardCell * ROWS;
    const computedH = Math.floor((fieldHeight - (queue.length - 1) * gap) / queue.length);
    const slotH = Math.max(28, Math.min(slotW, computedH));
    const startY = fieldTop;

    for (let i = 0; i < queue.length; i += 1) {
      const kind = queue[i];
      const boxSize = slotH;
      const bx = slotX + (slotW - boxSize) / 2;
      const by = startY + i * (slotH + gap);
      const isUsed = i < snapshot.queueIndex;
      const isCurrent = i === snapshot.queueIndex;

      // 카드 배경 (사용된 건 더 옅게)
      this.ctx.fillStyle = resolveCssVar(isUsed ? TOKENS.bgScreen : TOKENS.bgPanel);
      this.ctx.fillRect(bx, by, boxSize, boxSize);

      // 미니 피스
      const piece = createPiece(kind);
      const cells = piece.cells;
      const minX = Math.min(...cells.map((c) => c.x));
      const maxX = Math.max(...cells.map((c) => c.x));
      const minY = Math.min(...cells.map((c) => c.y));
      const maxY = Math.max(...cells.map((c) => c.y));
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      const miniSize = Math.floor(Math.min((boxSize - 8) / w, (boxSize - 8) / h));
      const offsetX = bx + (boxSize - w * miniSize) / 2;
      const offsetY = by + (boxSize - h * miniSize) / 2;
      const colors = PIECE_COLORS[kind];
      this.ctx.globalAlpha = isUsed ? 0.35 : 1;
      cells.forEach((c) => {
        const px = offsetX + (c.x - minX) * miniSize;
        const py = offsetY + (c.y - minY) * miniSize;
        this.ctx.fillStyle = resolveCssVar(colors.fill);
        this.ctx.fillRect(px, py, miniSize, miniSize);
        this.ctx.strokeStyle = resolveCssVar(colors.stroke);
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(px + 0.5, py + 0.5, miniSize - 1, miniSize - 1);
      });
      this.ctx.globalAlpha = 1;

      // 외곽선 (현재 = accent 굵게)
      if (isCurrent) {
        this.pixelStroke(bx, by, boxSize, boxSize, 2, resolveCssVar(TOKENS.accent));
      } else {
        this.pixelStroke(bx, by, boxSize, boxSize, 1, resolveCssVar(TOKENS.ink));
      }

      // 사용된 카드: 대각선
      if (isUsed) {
        this.ctx.strokeStyle = resolveCssVar(TOKENS.inkSoft);
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.moveTo(bx + 4, by + 4);
        this.ctx.lineTo(bx + boxSize - 4, by + boxSize - 4);
        this.ctx.stroke();
      }
    }
  }

  /** Planning 모드 컨트롤 — 단일 행 5-button (옵션 1: 현재 유지 + 시각 폴리시)
   *
   *  [◀] [↻] [▶] [▼] [⏬]
   *
   *  픽셀 아이콘 (◀ ▶ ▼ ⏬) + Unicode (↻)
   *  드롭 섀도우 (2px ink 오프셋) + 누름 효과 (active 시 2px translate, 섀도우 사라짐)
   */
  private renderControlButtons(snapshot: GameSnapshot, y: number): void {
    this.controlButtons = [];
    const screen = this.screenRect();
    const gap = 6;
    const usableW = screen.width - 24;
    const computed = Math.floor((usableW - 4 * gap) / 5);
    const boxSize = Math.max(40, Math.min(60, computed));
    const totalW = 5 * boxSize + 4 * gap;
    const startX = screen.x + (screen.width - totalW) / 2;

    const downReadyToLock = !!snapshot.current && this.isPieceOnFloor(snapshot);
    type ButtonSpec = {
      action: PlanningControl;
      bgToken: string;
      fgToken: string;
      pattern?: number[][];
      icon?: string;
    };
    const layout: ButtonSpec[] = [
      { action: "left",     bgToken: TOKENS.bgPanel, fgToken: TOKENS.ink, pattern: Renderer.PIXEL_ARROW_LEFT },
      { action: "rotate",   bgToken: TOKENS.bgPanel, fgToken: TOKENS.ink, icon: "↻" },
      { action: "right",    bgToken: TOKENS.bgPanel, fgToken: TOKENS.ink, pattern: Renderer.PIXEL_ARROW_RIGHT },
      {
        action: "down",
        bgToken: downReadyToLock ? TOKENS.success : TOKENS.bgPanel,
        fgToken: downReadyToLock ? TOKENS.bgPanel : TOKENS.ink,
        icon: downReadyToLock ? "⏎" : undefined,
        pattern: downReadyToLock ? undefined : Renderer.PIXEL_ARROW_DOWN,
      },
      { action: "hardDrop", bgToken: TOKENS.ink, fgToken: TOKENS.bgPanel, pattern: Renderer.PIXEL_ARROW_DOWN },
    ];

    for (let i = 0; i < layout.length; i += 1) {
      const b = layout[i];
      const bx = startX + i * (boxSize + gap);
      this.controlButtons.push({ x: bx, y, w: boxSize, h: boxSize, action: b.action });
      const pressed = snapshot.pressedControl === b.action;
      this.drawPolishedControlButton(bx, y, boxSize, b, pressed);
    }
  }

  /** 시각 폴리시 적용 버튼: 드롭 섀도우 + 누름 효과 + 픽셀/유니코드 아이콘 모두 지원 */
  private drawPolishedControlButton(
    x: number,
    y: number,
    size: number,
    spec: { bgToken: string; fgToken: string; pattern?: number[][]; icon?: string },
    pressed: boolean,
  ): void {
    const offset = pressed ? 2 : 0;
    // 드롭 섀도우 (눌리지 않은 상태에만)
    if (!pressed) {
      this.ctx.fillStyle = resolveCssVar(TOKENS.ink);
      this.ctx.fillRect(x + 2, y + 2, size, size);
    }
    // 본체 (눌리면 2px 아래/오른쪽으로 이동, 섀도우 자리에 들어감)
    const bx = x + offset;
    const by = y + offset;
    this.ctx.fillStyle = resolveCssVar(spec.bgToken);
    this.ctx.fillRect(bx, by, size, size);

    // 위/왼쪽 하이라이트
    this.ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    this.ctx.fillRect(bx + 1, by + 1, size - 2, 2);
    this.ctx.fillRect(bx + 1, by + 1, 2, size - 2);
    // 아래/오른쪽 음영
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
    this.ctx.fillRect(bx + 1, by + size - 3, size - 2, 2);
    this.ctx.fillRect(bx + size - 3, by + 1, 2, size - 2);
    // 외곽선
    this.pixelStroke(bx, by, size, size, 2, resolveCssVar(TOKENS.ink));

    // 아이콘 (픽셀 패턴 우선, 없으면 유니코드)
    if (spec.pattern) {
      this.drawPixelPattern(bx, by, size, spec.pattern, resolveCssVar(spec.fgToken));
    } else if (spec.icon) {
      this.ctx.font = `bold ${Math.floor(size * 0.46)}px ${FONT_MONO_BASE}`;
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.fillStyle = resolveCssVar(spec.fgToken);
      this.ctx.fillText(spec.icon, bx + size / 2, by + size / 2 + 1);
      this.ctx.textAlign = "left";
      this.ctx.textBaseline = "alphabetic";
    }
  }

  /** 픽셀 아트 아래 화살표 패턴 (7x7) */
  private static PIXEL_ARROW_DOWN: number[][] = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 1, 0],
    [0, 1, 1, 1, 1, 1, 0],
    [0, 0, 1, 1, 1, 0, 0],
    [0, 0, 1, 1, 1, 0, 0],
    [0, 0, 0, 1, 0, 0, 0],
  ];

  /** 픽셀 아트 왼쪽 화살표 (7x7) — 끝(apex)이 왼쪽, 베이스가 오른쪽 */
  private static PIXEL_ARROW_LEFT: number[][] = [
    [0, 0, 0, 1, 1, 1, 1],
    [0, 0, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 1, 1],
    [0, 0, 1, 1, 1, 1, 1],
    [0, 0, 0, 1, 1, 1, 1],
  ];

  /** 픽셀 아트 오른쪽 화살표 (7x7) — LEFT의 좌우 미러 */
  private static PIXEL_ARROW_RIGHT: number[][] = [
    [1, 1, 1, 1, 0, 0, 0],
    [1, 1, 1, 1, 1, 0, 0],
    [1, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 0, 0],
    [1, 1, 1, 1, 0, 0, 0],
  ];

  private drawPixelPattern(x: number, y: number, buttonSize: number, pattern: number[][], color: string): void {
    this.ctx.fillStyle = color;
    const rows = pattern.length;
    const cols = pattern[0].length;
    const iconSize = buttonSize * 0.6;
    const cellW = iconSize / cols;
    const cellH = iconSize / rows;
    const offsetX = x + (buttonSize - iconSize) / 2;
    const offsetY = y + (buttonSize - iconSize) / 2;
    for (let py = 0; py < rows; py += 1) {
      for (let px = 0; px < cols; px += 1) {
        if (pattern[py][px]) {
          this.ctx.fillRect(
            Math.floor(offsetX + px * cellW),
            Math.floor(offsetY + py * cellH),
            Math.ceil(cellW),
            Math.ceil(cellH),
          );
        }
      }
    }
  }


  /** 현재 피스가 바닥/스택 위에 있는지 — ▼ 버튼이 잠금 모드여야 할 때 */
  private isPieceOnFloor(snapshot: GameSnapshot): boolean {
    if (!snapshot.current) return false;
    const piece = snapshot.current;
    const cells = absoluteCells({ ...piece, y: piece.y + 1 });
    for (const c of cells) {
      if (c.x < 0 || c.x >= COLS || c.y >= ROWS) return true;
      if (c.y >= 0 && snapshot.grid[c.y][c.x] !== null) return true;
    }
    return false;
  }

  private renderEditor(snapshot: GameSnapshot, board: DOMRect): void {
    const screen = this.screenRect();
    // 화면 아래 180px은 툴바 2줄 + 상태배너 + 버튼 + 힌트용 (큰 터치 영역)
    const reservedBottom = 180;
    const limit = screen.y + screen.height - reservedBottom;
    const usableHeight = Math.max(40, Math.min(board.height, limit - board.y));
    const cell = Math.floor(Math.min(board.width / COLS, usableHeight / ROWS));
    const ox = board.x + (board.width - cell * COLS) / 2;
    const oy = board.y + (usableHeight - cell * ROWS) / 2;
    const boardW = cell * COLS;
    const boardH = cell * ROWS;
    this.boardOx = ox;
    this.boardOy = oy;
    this.boardCell = cell;

    // editShake — 거부 시 보드 좌우 흔들기
    const shakeAmount = snapshot.animation.editShake;
    const shakeX = shakeAmount > 0.02 ? Math.sin(performance.now() * 0.06) * shakeAmount * 8 : 0;
    if (shakeX !== 0) this.ctx.save();
    if (shakeX !== 0) this.ctx.translate(shakeX, 0);

    // 보드 배경 (크림) — 거부 중이면 빨간 틴트
    this.ctx.fillStyle = resolveCssVar(TOKENS.bgBoard);
    this.ctx.fillRect(ox, oy, boardW, boardH);
    if (shakeAmount > 0.1) {
      this.ctx.fillStyle = resolveCssVar(TOKENS.danger);
      this.ctx.globalAlpha = shakeAmount * 0.25;
      this.ctx.fillRect(ox, oy, boardW, boardH);
      this.ctx.globalAlpha = 1;
    }

    // 그리드 (편집 모드에서는 더 진하게 — 셀 경계 명확)
    this.ctx.strokeStyle = "rgba(26, 26, 46, 0.18)";
    this.ctx.lineWidth = 1;
    for (let x = 1; x < COLS; x += 1) {
      this.line(ox + x * cell + 0.5, oy, ox + x * cell + 0.5, oy + boardH);
    }
    for (let y = 1; y < ROWS; y += 1) {
      this.line(ox, oy + y * cell + 0.5, ox + boardW, oy + y * cell + 0.5);
    }

    // editGrid 셀 그리기 — 각 셀의 실제 kind 색상으로
    snapshot.editGrid.forEach((row, y) => {
      row.forEach((c, x) => {
        if (c) this.drawCell(ox, oy, cell, x, y, c, 1, false);
      });
    });

    // 떨어질 위치 ghost (반투명) + 현재 피스 (위에서 아래로 떨어지는 중)
    if (snapshot.editGhostCells && snapshot.editCurrentPiece) {
      const kind = snapshot.editCurrentPiece.kind;
      snapshot.editGhostCells.forEach((p) => {
        if (p.y < 0 || p.y >= ROWS || p.x < 0 || p.x >= COLS) return;
        this.drawCell(ox, oy, cell, p.x, p.y, kind, 0.3, false);
      });
    }
    if (snapshot.editCurrentPiece) {
      const piece = snapshot.editCurrentPiece;
      const cells = absoluteCells(piece);
      cells.forEach((p) => {
        if (p.y < 0 || p.y >= ROWS || p.x < 0 || p.x >= COLS) return;
        this.drawCell(ox, oy, cell, p.x, p.y, piece.kind, 1, true);
      });
    }

    // 호버 미리보기 (legacy — null 일 가능성 높음)
    if (snapshot.editHoverGhost) {
      const { cells, kind, valid } = snapshot.editHoverGhost;
      const alpha = valid ? 0.5 : 0.25;
      cells.forEach((p) => {
        if (p.y < 0 || p.y >= ROWS || p.x < 0 || p.x >= COLS) return;
        this.drawCell(ox, oy, cell, p.x, p.y, kind, alpha, false);
      });
      if (!valid) {
        cells.forEach((p) => {
          if (p.y < 0 || p.y >= ROWS || p.x < 0 || p.x >= COLS) return;
          this.ctx.strokeStyle = resolveCssVar(TOKENS.danger);
          this.ctx.lineWidth = 2;
          this.ctx.beginPath();
          this.ctx.moveTo(ox + p.x * cell + 4, oy + p.y * cell + 4);
          this.ctx.lineTo(ox + (p.x + 1) * cell - 4, oy + (p.y + 1) * cell - 4);
          this.ctx.moveTo(ox + (p.x + 1) * cell - 4, oy + p.y * cell + 4);
          this.ctx.lineTo(ox + p.x * cell + 4, oy + (p.y + 1) * cell - 4);
          this.ctx.stroke();
        });
      }
    }

    // 외곽선
    this.pixelStroke(ox, oy, boardW, boardH, 3, resolveCssVar(TOKENS.ink));

    if (shakeX !== 0) this.ctx.restore();

    // 보드 우측에 piece 큐 미니 표시 (next 3)
    this.renderEditorQueue(snapshot, ox + boardW + 8, oy);

    // 분석 결과 — 보드 위에
    this.renderEditorAnalysis(snapshot, ox, oy - 30, boardW);

    // 툴바 — 보드 바로 아래
    this.renderEditorToolbar(snapshot, oy + boardH + 10);
  }

  private renderEditorQueue(snapshot: GameSnapshot, x: number, y: number): void {
    // status === "ready" 면 AI 가 찾아낸 풀이 큐를 강조 표시 (생성블록 = 플레이 큐)
    const ready = snapshot.editStatus === "ready" && snapshot.editFoundQueue;
    const isReady = !!ready;
    const queue = isReady
      ? snapshot.editFoundQueue!
      : snapshot.editPieceQueue.slice(0, 3);
    if (queue.length === 0) return;
    const slotSize = isReady ? 36 : 28;
    const gap = 4;
    this.ctx.save();
    this.ctx.font = `8px ${FONT_PIXEL_BASE}`;
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "alphabetic";
    if (isReady) {
      this.ctx.fillStyle = resolveCssVar(TOKENS.success);
      this.ctx.fillText("PLAY QUEUE ▶", x, y - 4);
    } else {
      this.ctx.fillStyle = resolveCssVar(TOKENS.inkSoft);
      this.ctx.fillText("NEXT", x, y - 4);
    }
    queue.forEach((kind, i) => {
      const sy = y + i * (slotSize + gap);
      this.ctx.fillStyle = resolveCssVar(isReady || i === 0 ? TOKENS.bgPanel : TOKENS.bgScreen);
      this.ctx.fillRect(x, sy, slotSize, slotSize);
      this.pixelStroke(
        x, sy, slotSize, slotSize,
        isReady ? 2 : (i === 0 ? 2 : 1),
        resolveCssVar(isReady ? TOKENS.success : (i === 0 ? TOKENS.accent : TOKENS.ink)),
      );
      // 미니 piece
      const piece = createPiece(kind);
      const cells = piece.cells;
      const minX = Math.min(...cells.map((c) => c.x));
      const maxX = Math.max(...cells.map((c) => c.x));
      const minY = Math.min(...cells.map((c) => c.y));
      const maxY = Math.max(...cells.map((c) => c.y));
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      const mini = Math.floor(Math.min((slotSize - 6) / w, (slotSize - 6) / h));
      const offX = x + (slotSize - w * mini) / 2;
      const offY = sy + (slotSize - h * mini) / 2;
      const colors = PIECE_COLORS[kind];
      cells.forEach((c) => {
        this.ctx.fillStyle = resolveCssVar(colors.fill);
        this.ctx.fillRect(offX + (c.x - minX) * mini, offY + (c.y - minY) * mini, mini, mini);
      });
      // 순번 (READY 일 때만)
      if (isReady) {
        this.ctx.font = `bold 9px ${FONT_MONO_BASE}`;
        this.ctx.fillStyle = resolveCssVar(TOKENS.ink);
        this.ctx.fillText(String(i + 1), x + 2, sy + 10);
        this.ctx.font = `8px ${FONT_PIXEL_BASE}`;
      }
    });
    this.ctx.restore();
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "alphabetic";
  }

  private renderEditorAnalysis(snapshot: GameSnapshot, x: number, y: number, w: number): void {
    const cells = snapshot.editGrid.flat().filter((c) => c !== null).length;
    const sol = snapshot.editSolutionEstimate;
    const analyzing = snapshot.editAnalyzing;
    const q = snapshot.editQueueLength;
    const total = cells + q * 4;
    const targetLines = total > 0 && total % 10 === 0 ? total / 10 : null;
    const oddCells = cells % 2 === 1;

    // 라인 1: 보드 상태 + 분석
    let line1: string;
    let line1Color: string = TOKENS.inkSoft;
    if (cells === 0) line1 = "EMPTY — STACK PIECES";
    else if (oddCells) { line1 = `${cells} CELLS — ODD! ADD/REMOVE 1`; line1Color = TOKENS.warning; }
    else if (cells < 6) line1 = `${cells} CELLS — KEEP STACKING`;
    else if (analyzing) line1 = `${cells} CELLS — ANALYZING…`;
    else if (sol > 0) { line1 = `${cells} CELLS — SOLVABLE ✓`; line1Color = TOKENS.success; }
    else { line1 = `${cells} CELLS — NO SOLUTION`; line1Color = TOKENS.warning; }

    // 라인 2: 미션 (target lines + queue length)
    const line2 = targetLines !== null
      ? `MISSION: CLEAR ${targetLines} LINES · Q=${q} (+/-)`
      : `Q=${q} (+/-) — ADJUST TO MATCH CELLS`;
    const line2Color = targetLines !== null ? TOKENS.accent : TOKENS.inkSoft;

    this.ctx.save();
    this.ctx.font = `9px ${FONT_PIXEL_BASE}`;
    this.ctx.textAlign = "left";
    this.ctx.fillStyle = resolveCssVar(line1Color);
    this.ctx.fillText(line1, x, y + 4);
    this.ctx.fillStyle = resolveCssVar(line2Color);
    this.ctx.fillText(line2, x, y + 16);
    this.ctx.restore();
    void w;
  }

  private renderEditorToolbar(snapshot: GameSnapshot, toolbarY: number): void {
    this.editRotateButton = null;
    // 에디터 모드 D-pad — Planning 의 renderControlButtons 와 동일 5-button 구조
    // (left/rotate/right/down/hardDrop) 단, controlButtons 배열을 공유 — input.ts 가 같은 핸들러로 처리
    this.renderControlButtons(snapshot, toolbarY);
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
      // 큐 길이 색상: 수학적으로 가능하면 ink, 불가능하면 warning
      const feasible = snapshot.editFeasibleLengths;
      const queueOk = cellsFilled === 0 || feasible.includes(snapshot.editQueueLength);
      const queueColor =
        snapshot.editStatus === "ready"
          ? resolveCssVar(TOKENS.success)
          : !queueOk
            ? resolveCssVar(TOKENS.warning)
            : snapshot.editStatus === "no-solution"
              ? resolveCssVar(TOKENS.danger)
              : resolveCssVar(TOKENS.ink);
      this.ctx.fillStyle = queueColor;
      this.ctx.fillText(this.padNumber(snapshot.editQueueLength, 2), screen.x + screen.width - 14, top + 26);
      this.ctx.textAlign = "left";

      this.ctx.strokeStyle = resolveCssVar(TOKENS.ink);
      this.ctx.lineWidth = 1;
      this.line(screen.x + 12, top + 44, screen.x + screen.width - 12, top + 44);
      return;
    }

    // 단일 행 인라인 헤더: [✕] LINES 1/3   2/6   TRY 01 [↻]
    const total = snapshot.puzzle.queue.length;
    const placed = snapshot.queueIndex;
    const target = snapshot.puzzle.targetLines;
    const cleared = snapshot.linesCleared;
    const tries = snapshot.attempts + (snapshot.mode === "planning" ? 1 : 0);
    const rowY = top + 10;

    // 좌우 버튼 (planning 모드 한정 — feed/clear/failed 에선 hit area 비활성)
    if (snapshot.mode === "planning") {
      const btnW = 28;
      const btnH = 20;
      const btnY = top;
      this.quitButton = { x: screen.x + 4, y: btnY, w: btnW, h: btnH };
      this.retryButton = { x: screen.x + screen.width - btnW - 4, y: btnY, w: btnW, h: btnH };
      this.drawTopButton(this.quitButton, "✕");
      this.drawTopButton(this.retryButton, "↻");
    } else {
      this.quitButton = null;
      this.retryButton = null;
    }

    // 좌: LINES X/Y (목표 진행도) — planning 모드면 quit 버튼 폭만큼 우측으로 시프트
    const leftShift = snapshot.mode === "planning" ? 36 : 10;
    const rightShift = snapshot.mode === "planning" ? 36 : 10;
    this.ctx.font = `9px ${FONT_PIXEL_BASE}`;
    this.ctx.fillStyle = resolveCssVar(TOKENS.inkSoft);
    this.ctx.textAlign = "left";
    this.ctx.fillText("LINES", screen.x + leftShift, rowY);
    this.ctx.font = `bold 13px ${FONT_MONO_BASE}`;
    this.ctx.fillStyle = target > 0 && cleared >= target
      ? resolveCssVar(TOKENS.success)
      : resolveCssVar(TOKENS.ink);
    const linesText = target > 0 ? `${cleared}/${target}` : `${cleared}`;
    this.ctx.fillText(linesText, screen.x + leftShift + 38, rowY);

    // 중: 0/6 (라벨 생략)
    this.ctx.textAlign = "center";
    this.ctx.fillStyle = resolveCssVar(TOKENS.ink);
    this.ctx.fillText(`${placed}/${total}`, screen.x + screen.width / 2, rowY);

    // 우: TRY 01
    this.ctx.textAlign = "right";
    this.ctx.fillStyle = tries > 1 ? resolveCssVar(TOKENS.danger) : resolveCssVar(TOKENS.ink);
    this.ctx.fillText(this.padNumber(Math.max(1, tries), 2), screen.x + screen.width - rightShift, rowY);
    this.ctx.font = `9px ${FONT_PIXEL_BASE}`;
    this.ctx.fillStyle = resolveCssVar(TOKENS.inkSoft);
    this.ctx.fillText("TRY", screen.x + screen.width - rightShift - 26, rowY);
    this.ctx.textAlign = "left";

    // 미션 라벨 — 헤더 바로 아래
    this.ctx.font = `bold 10px ${FONT_MONO_BASE}`;
    this.ctx.textAlign = "center";
    this.ctx.fillStyle = resolveCssVar(TOKENS.accent);
    this.ctx.fillText(this.computeMissionText(snapshot), screen.x + screen.width / 2, top + 26);
    this.ctx.textAlign = "left";
  }

  /** 퍼즐별 미션 문구 — puzzle.targetLines 를 직접 사용 (게임 로직과 동일 기준). */
  private computeMissionText(snapshot: GameSnapshot): string {
    const queueLen = snapshot.puzzle.queue.length;
    const lines = snapshot.puzzle.targetLines;
    const diff = snapshot.puzzle.difficulty.toUpperCase();
    if (lines <= 0 || queueLen === 0) return `▶ ${diff} · ${queueLen} PIECES → EMPTY THE BOARD`;
    const lineLabel = lines === 1 ? "LINE" : "LINES";
    const pieceLabel = queueLen === 1 ? "PIECE" : "PIECES";
    if (lines === 4) return `▶ ${diff} · ${queueLen} ${pieceLabel} → TETRIS!`;
    return `▶ ${diff} · ${queueLen} ${pieceLabel} → CLEAR ${lines} ${lineLabel}`;
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

  private renderGestureHints(snapshot: GameSnapshot): void {
    this.editButton = null;
    this.finishButton = null;

    if (snapshot.mode === "planning") {
      // 스와이프 제스처 제거 — 상단 quit/retry 버튼 + 하단 D-pad 로 모든 조작 명시화
      return;
    }

    if (snapshot.mode === "editing") {
      const screen = this.screenRect();
      const hasBlocks = snapshot.editGrid.some((row) => row.some((c) => c !== null));

      // 상태 라벨 (배너)
      let statusLine = "TAP CELL TO TOGGLE";
      let statusColor: string = TOKENS.inkSoft;
      const feasible = snapshot.editFeasibleLengths;
      const queueOk = !hasBlocks || feasible.includes(snapshot.editQueueLength);

      if (!hasBlocks) {
        statusLine = "EMPTY BOARD — PLACE BLOCKS";
        statusColor = TOKENS.inkMute;
      } else if (snapshot.editStatus === "generating") {
        statusLine = "SOLVING — PLEASE WAIT";
        statusColor = TOKENS.info;
      } else if (snapshot.editStatus === "ready") {
        statusLine = `READY — ${snapshot.editFoundQueue?.join(" ")}`;
        statusColor = TOKENS.success;
      } else if (!queueOk) {
        // 수학적으로 불가능 — 친절한 안내
        if (feasible.length === 0) {
          statusLine = "ODD CELL COUNT — ADD/REMOVE 1";
        } else {
          statusLine = `Q=${snapshot.editQueueLength} WON'T FIT — TRY ${feasible.slice(0, 3).join("/")}`;
        }
        statusColor = TOKENS.warning;
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
      const disabled = !hasBlocks || generating;
      const fillColor = !hasBlocks
        ? resolveCssVar(TOKENS.bgScreen)
        : generating
          ? resolveCssVar(TOKENS.bgPanel)
          : ready
            ? resolveCssVar(TOKENS.success)
            : resolveCssVar(TOKENS.accent);
      this.ctx.fillStyle = fillColor;
      this.ctx.fillRect(btnX, btnY, btnW, btnH);
      this.pixelStroke(btnX, btnY, btnW, btnH, 2, resolveCssVar(TOKENS.ink));
      this.ctx.font = `bold 12px ${FONT_PIXEL_BASE}`;
      this.ctx.textBaseline = "middle";
      this.ctx.fillStyle = disabled
        ? resolveCssVar(TOKENS.inkMute)
        : resolveCssVar(TOKENS.bgPanel);
      let label: string;
      if (!hasBlocks) {
        label = "PLACE BLOCKS";
      } else if (generating) {
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
        "+/- LENGTH   R ROTATE   ESC EXIT",
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

    // 모달 박스 (clear 모드는 SHARE 버튼 자리만큼 더 크게)
    const boxW = Math.min(this.width - 64, 320);
    const boxH = snapshot.mode === "clear" ? 170 : 140;
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

    // SHARE 버튼 (clear 모드에서만)
    this.shareResultButton = null;
    if (snapshot.mode === "clear") {
      const shareW = 100;
      const shareH = 28;
      const shareX = this.width / 2 - shareW / 2;
      const shareY = boxY + 76;
      this.shareResultButton = { x: shareX, y: shareY, w: shareW, h: shareH };
      this.ctx.fillStyle = resolveCssVar(TOKENS.success);
      this.ctx.fillRect(shareX, shareY, shareW, shareH);
      this.pixelStroke(shareX, shareY, shareW, shareH, 2, resolveCssVar(TOKENS.ink));
      this.ctx.font = `bold 10px ${FONT_PIXEL_BASE}`;
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.fillStyle = resolveCssVar(TOKENS.bgPanel);
      this.ctx.fillText("📋 SHARE", shareX + shareW / 2, shareY + shareH / 2);
    }

    // 서브 텍스트
    this.ctx.textBaseline = "alphabetic";
    this.ctx.font = `10px ${FONT_PIXEL_BASE}`;
    this.ctx.fillStyle = resolveCssVar(TOKENS.inkSoft);
    const subText =
      snapshot.mode === "clear"
        ? "TAP NEXT PUZZLE"
        : "TAP TRY AGAIN";
    this.ctx.fillText(subText, this.width / 2, boxY + 120);

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
    const top = screen.y + 36;
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

  /** 상단 모서리 작은 아이콘 버튼 (quit / retry). 평면 박스 + 외곽선 + 가운데 글리프. */
  private drawTopButton(rect: { x: number; y: number; w: number; h: number }, glyph: string): void {
    this.ctx.save();
    this.ctx.fillStyle = resolveCssVar(TOKENS.bgPanel);
    this.ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    this.pixelStroke(rect.x, rect.y, rect.w, rect.h, 1, resolveCssVar(TOKENS.ink));
    this.ctx.font = `bold 13px ${FONT_MONO_BASE}`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillStyle = resolveCssVar(TOKENS.ink);
    this.ctx.fillText(glyph, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
    this.ctx.restore();
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "alphabetic";
  }
}
