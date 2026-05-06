import { COLS, ROWS, type Cell, type GameSnapshot, type PieceKind, type Puzzle } from "./gameTypes";
import { absoluteCells } from "./pieces";

const COLORS: Record<PieceKind | "garbage", string> = {
  I: "#66e7ff",
  O: "#f8e76c",
  T: "#c58cff",
  L: "#ff9f63",
  J: "#72a7ff",
  S: "#80f3a0",
  Z: "#ff6f91",
  garbage: "#465063",
};

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D is not available.");
    this.ctx = ctx;
    this.resize();
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
  }

  render(snapshot: GameSnapshot, now: number): void {
    this.background(now);
    this.renderTop(snapshot);
    const board = this.boardRect();
    if (snapshot.mode === "feed") {
      this.renderFeed(snapshot, board, now);
    } else {
      this.renderBoard(snapshot, board, now, true);
    }
    this.renderGestureHints(snapshot);
    this.renderOverlays(snapshot, now);
  }

  private background(now: number): void {
    const g = this.ctx.createLinearGradient(0, 0, this.width, this.height);
    g.addColorStop(0, "#080b14");
    g.addColorStop(0.46, "#111726");
    g.addColorStop(1, "#090d16");
    this.ctx.fillStyle = g;
    this.ctx.fillRect(0, 0, this.width, this.height);

    this.ctx.globalAlpha = 0.12;
    this.ctx.strokeStyle = "#9ff8ff";
    this.ctx.lineWidth = 1;
    const gap = 28;
    const drift = (now / 80) % gap;
    for (let y = -gap + drift; y < this.height; y += gap) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();
    }
    this.ctx.globalAlpha = 1;
  }

  private renderTop(snapshot: GameSnapshot): void {
    const safeTop = this.safeTop();
    this.ctx.fillStyle = "rgba(8, 11, 20, 0.55)";
    this.ctx.fillRect(0, 0, this.width, safeTop + 58);
    this.ctx.font = "700 16px Inter, system-ui, sans-serif";
    this.ctx.textBaseline = "middle";
    this.ctx.fillStyle = "#eff8ff";
    this.ctx.fillText(`${snapshot.puzzle.targetLines} LINES CLEAR`, 18, safeTop + 30);
    this.ctx.textAlign = "right";
    this.ctx.fillStyle = snapshot.blocksLeft <= 1 && snapshot.mode === "playing" ? "#ff6f91" : "#b7c8d9";
    const blocks = snapshot.mode === "feed" ? snapshot.puzzle.movesLimit : snapshot.blocksLeft;
    this.ctx.fillText(`${blocks} BLOCKS`, this.width - 18, safeTop + 30);
    this.ctx.textAlign = "left";
  }

  private renderFeed(snapshot: GameSnapshot, board: DOMRect, now: number): void {
    const easedY = this.easeOut(snapshot.animation.feedSlide);
    const amountY = Math.abs(easedY);
    const amountX = this.easeOut(snapshot.animation.feedSlideX);
    const directionY = Math.sign(easedY) || 1;
    const slide = directionY * amountY * this.height * 0.82;
    const slideX = amountX * this.width * 0.82;
    const shake = snapshot.animation.feedShake > 0.02 ? Math.sin(now * 0.08) * snapshot.animation.feedShake * 8 : 0;
    const base = new DOMRect(board.x + board.width * 0.04, board.y, board.width * 0.92, board.height * 0.94);
    const preview = new DOMRect(base.x + slideX + shake, base.y + slide, base.width, base.height);

    if (snapshot.animation.previousPuzzle && snapshot.animation.previousGrid && (amountY > 0.02 || Math.abs(amountX) > 0.02)) {
      const oldY = base.y - directionY * (1 - amountY) * this.height * 0.82;
      const oldX = base.x - Math.sign(amountX) * (1 - Math.abs(amountX)) * this.width * 0.82;
      const outgoing = new DOMRect(amountY > 0.02 ? base.x : oldX, amountY > 0.02 ? oldY : base.y, base.width, base.height);
      this.renderFeedCard(snapshot, snapshot.animation.previousPuzzle, snapshot.animation.previousGrid, outgoing, now, 0.76 + amountY * 0.24);
    }

    this.renderFeedCard(snapshot, snapshot.puzzle, snapshot.grid, preview, now, 1);
  }

  private renderFeedCard(snapshot: GameSnapshot, puzzle: Puzzle, grid: Cell[][], preview: DOMRect, now: number, alpha: number): void {
    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.roundRect(preview.x, preview.y, preview.width, preview.height, 8, "rgba(255,255,255,0.055)", "rgba(164,224,255,0.16)");
    this.renderBoard({ ...snapshot, puzzle, grid, current: null, next: null }, this.innerRect(preview, 18), now, false);

    this.ctx.textAlign = "center";
    this.ctx.font = "800 23px Inter, system-ui, sans-serif";
    this.ctx.fillStyle = "#f5fbff";
    this.ctx.fillText(puzzle.difficulty.toUpperCase(), preview.x + preview.width / 2, preview.y + preview.height - 82);
    this.ctx.font = "600 13px Inter, system-ui, sans-serif";
    this.ctx.fillStyle = "#9fb2c6";
    this.ctx.fillText("TAP START  /  UP NEXT  /  DOWN PREVIOUS", preview.x + preview.width / 2, preview.y + preview.height - 51);
    const challengeHint = puzzle.difficulty === "Challenge" ? "SWIPE RIGHT BACK" : "SWIPE LEFT CHALLENGE";
    this.ctx.fillText(challengeHint, preview.x + preview.width / 2, preview.y + preview.height - 28);
    this.ctx.textAlign = "left";
    this.ctx.restore();
  }

  private renderBoard(snapshot: GameSnapshot, board: DOMRect, now: number, active: boolean): void {
    const cell = Math.floor(Math.min(board.width / COLS, board.height / ROWS));
    const ox = board.x + (board.width - cell * COLS) / 2;
    const oy = board.y + (board.height - cell * ROWS) / 2;
    const pulse = Math.max(0, 1 - (now - snapshot.animation.landedAt) / 120);

    this.roundRect(ox - 8, oy - 8, cell * COLS + 16, cell * ROWS + 16, 8, "rgba(3,6,12,0.72)", "rgba(160,220,255,0.18)");
    this.ctx.strokeStyle = "rgba(197, 224, 255, 0.06)";
    this.ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x += 1) {
      this.line(ox + x * cell, oy, ox + x * cell, oy + ROWS * cell);
    }
    for (let y = 0; y <= ROWS; y += 1) {
      this.line(ox, oy + y * cell, ox + COLS * cell, oy + y * cell);
    }

    snapshot.grid.forEach((row, y) => {
      row.forEach((kind, x) => {
        if (kind) this.drawCell(ox, oy, cell, x, y, kind, 1, false);
      });
    });

    const clearingAge = now - snapshot.animation.clearStartedAt;
    if (clearingAge < 180) {
      this.ctx.globalAlpha = 1 - clearingAge / 180;
      snapshot.animation.clearingRows.forEach((row) => {
        this.ctx.fillStyle = "#eaffff";
        this.ctx.fillRect(ox, oy + row * cell, cell * COLS, cell);
      });
      this.ctx.globalAlpha = 1;
    }

    if (snapshot.current) {
      const cells = absoluteCells(snapshot.current);
      cells.forEach((point) => this.drawCell(ox, oy, cell, point.x, point.y, snapshot.current!.kind, 1, pulse > 0));
      this.drawGhost(snapshot, ox, oy, cell);
    }

    if (active) this.renderNext(snapshot, ox, oy, cell);
  }

  private drawGhost(snapshot: GameSnapshot, ox: number, oy: number, cell: number): void {
    if (!snapshot.current) return;
    let ghost = snapshot.current;
    while (
      absoluteCells({ ...ghost, y: ghost.y + 1 }).every((point) => point.y < ROWS && point.x >= 0 && point.x < COLS && (point.y < 0 || !snapshot.grid[point.y][point.x]))
    ) {
      ghost = { ...ghost, y: ghost.y + 1 };
    }
    absoluteCells(ghost).forEach((point) => this.drawCell(ox, oy, cell, point.x, point.y, ghost.kind, 0.18, false));
  }

  private drawCell(ox: number, oy: number, size: number, x: number, y: number, kind: PieceKind | "garbage", alpha: number, landed: boolean): void {
    if (y < 0) return;
    const inset = Math.max(2, size * 0.08);
    const px = ox + x * size + inset;
    const py = oy + y * size + inset + (landed ? 1.5 : 0);
    const w = size - inset * 2;
    const h = size - inset * 2 - (landed ? 2 : 0);
    this.ctx.globalAlpha = alpha;
    this.ctx.shadowColor = COLORS[kind];
    this.ctx.shadowBlur = landed ? 18 : 7;
    this.roundRect(px, py, w, h, 5, COLORS[kind], "rgba(255,255,255,0.32)");
    this.ctx.shadowBlur = 0;
    this.ctx.globalAlpha = 1;
  }

  private renderNext(snapshot: GameSnapshot, ox: number, oy: number, cell: number): void {
    this.ctx.textAlign = "right";
    this.ctx.font = "700 11px Inter, system-ui, sans-serif";
    this.ctx.fillStyle = "#7f93a8";
    this.ctx.fillText("NEXT", ox + COLS * cell, oy - 18);
    if (snapshot.next) {
      this.ctx.fillStyle = COLORS[snapshot.next];
      this.ctx.fillText(snapshot.next, ox + COLS * cell, oy - 34);
    }
    this.ctx.textAlign = "left";
  }

  private renderGestureHints(snapshot: GameSnapshot): void {
    if (snapshot.mode !== "playing") return;
    const top = this.safeTop() + 64;

    this.ctx.save();
    this.ctx.globalAlpha = 0.42;
    this.ctx.textAlign = "center";
    this.ctx.font = "700 10px Inter, system-ui, sans-serif";
    this.ctx.fillStyle = "#b7c8d9";
    this.ctx.fillText("SWIPE MOVE   TAP ROTATE   DOWN DROP   UP QUIT", this.width / 2, top + 18);
    this.ctx.restore();
    this.ctx.textAlign = "left";
  }

  private renderOverlays(snapshot: GameSnapshot, now: number): void {
    if (snapshot.mode !== "clear" && snapshot.mode !== "failed") return;
    const age = now - snapshot.animation.messageStartedAt;
    const alpha = Math.max(0, Math.min(1, 1 - Math.max(0, age - 1200) / 600));
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = "rgba(4, 7, 14, 0.58)";
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.font = "900 52px Inter, system-ui, sans-serif";
    this.ctx.fillStyle = snapshot.mode === "clear" ? "#b8ffd1" : "#ffd2dc";
    this.ctx.fillText(snapshot.animation.message, this.width / 2, this.height * 0.45);
    this.ctx.font = "700 14px Inter, system-ui, sans-serif";
    this.ctx.fillStyle = "#d4e2ef";
    this.ctx.fillText("TAP RETRY  /  SWIPE DOWN NEXT", this.width / 2, this.height * 0.52);
    this.ctx.globalAlpha = 1;
    this.ctx.textAlign = "left";
  }

  private boardRect(): DOMRect {
    const top = this.safeTop() + this.height * 0.085;
    const bottom = this.height - this.safeBottom() - 12;
    return new DOMRect(0, top, this.width, bottom - top);
  }

  private innerRect(rect: DOMRect, pad: number): DOMRect {
    return new DOMRect(rect.x + pad, rect.y + pad, rect.width - pad * 2, rect.height - pad * 2 - 88);
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

  private roundRect(x: number, y: number, w: number, h: number, r: number, fill: string, stroke: string): void {
    this.ctx.beginPath();
    this.ctx.roundRect(x, y, w, h, r);
    this.ctx.fillStyle = fill;
    this.ctx.fill();
    this.ctx.strokeStyle = stroke;
    this.ctx.stroke();
  }

  private line(x1: number, y1: number, x2: number, y2: number): void {
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
  }
}
