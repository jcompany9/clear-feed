import {
  COLS,
  ROWS,
  type AnimationState,
  type Cell,
  type FeedItem,
  type GameMode,
  type GameSnapshot,
  type Piece,
  type Point,
  type Puzzle,
} from "./gameTypes";
import { absoluteCells, createPiece, rotatePiece } from "./pieces";
import { createFeedPuzzle, createInitialFeed } from "./puzzleGenerator";
import { loadStorage, rememberPuzzle, setSoundOn } from "./storage";
import { SoundSystem } from "./sound";

interface PlacementSnapshot {
  grid: Cell[][];
  queueIndex: number;
}

export class Game {
  private mode: GameMode = "feed";
  private feed: FeedItem[];
  private feedIndex = 0;
  private grid: Cell[][];
  private currentPiece: Piece | null = null;
  private queueIndex = 0;
  private history: PlacementSnapshot[] = [];
  private attempts = 0;
  private sound: SoundSystem;
  private animation: AnimationState = {
    landedAt: 0,
    landingCells: [] as Point[],
    clearingRows: [] as number[],
    clearStartedAt: 0,
    message: "",
    messageStartedAt: 0,
    toast: "",
    toastAt: 0,
    feedSlide: 0,
    feedSlideX: 0,
    feedShake: 0,
    touchTrail: [],
  };

  constructor(sound: SoundSystem, initialSeed?: number) {
    this.sound = sound;
    const saved = loadStorage();
    this.sound.setEnabled(saved.soundOn);
    const seedBase = initialSeed ?? saved.lastSeed + 17;
    this.feed = createInitialFeed(6, seedBase).map((puzzle) => ({ puzzle, cleared: false }));
    this.grid = cloneGrid(this.activePuzzle.grid);
  }

  get activePuzzle(): Puzzle {
    return this.feed[this.feedIndex].puzzle;
  }

  get snapshot(): GameSnapshot {
    return {
      mode: this.mode,
      puzzle: this.activePuzzle,
      grid: this.grid,
      current: this.currentPiece,
      next: this.activePuzzle.queue[this.queueIndex + 1] ?? null,
      blocksLeft: this.activePuzzle.queue.length - this.queueIndex,
      linesCleared: 0,
      feed: this.feed,
      feedIndex: this.feedIndex,
      soundOn: this.sound.isEnabled,
      animation: this.animation,
      attempts: this.attempts,
      queueIndex: this.queueIndex,
      ghostCells: this.computeGhost(),
    };
  }

  update(_now: number): void {
    this.animation.feedSlide *= 0.86;
    this.animation.feedSlideX *= 0.86;
    this.animation.feedShake *= 0.78;
    if (Math.abs(this.animation.feedSlide) < 0.015 && Math.abs(this.animation.feedSlideX) < 0.015) {
      this.animation.previousPuzzle = undefined;
      this.animation.previousGrid = undefined;
    }
  }

  startPlanning(): void {
    if (this.mode === "planning") return;
    this.mode = "planning";
    this.grid = cloneGrid(this.activePuzzle.grid);
    this.queueIndex = 0;
    this.history = [];
    this.attempts = 0;
    this.animation.message = "";
    this.spawnNext();
    this.sound.unlock();
  }

  /** 큐의 다음 피스를 currentPiece로 스폰 */
  private spawnNext(): void {
    if (this.queueIndex >= this.activePuzzle.queue.length) {
      this.evaluate();
      return;
    }
    const kind = this.activePuzzle.queue[this.queueIndex];
    const piece = createPiece(kind); // 기본 위치 x=4, y=1
    if (!this.canPlace(piece)) {
      // 스폰 위치에 충돌 → 더 진행 못함
      this.currentPiece = null;
      this.evaluate();
      return;
    }
    this.currentPiece = piece;
  }

  /** 좌/우 1칸 이동 */
  moveCurrent(dx: -1 | 1): void {
    if (this.mode !== "planning" || !this.currentPiece) return;
    const moved = { ...this.currentPiece, x: this.currentPiece.x + dx };
    if (this.canPlace(moved)) {
      this.currentPiece = moved;
      this.sound.play("move");
    }
  }

  /** 특정 컬럼으로 직접 이동 (드래그용). 충돌하면 가능한 데까지만 이동. */
  setPieceColumn(col: number): void {
    if (this.mode !== "planning" || !this.currentPiece) return;
    const dx = col - this.currentPiece.x;
    const sign = Math.sign(dx);
    if (sign === 0) return;
    let piece = this.currentPiece;
    for (let i = 0; i < Math.abs(dx); i += 1) {
      const next = { ...piece, x: piece.x + sign };
      if (!this.canPlace(next)) break;
      piece = next;
    }
    this.currentPiece = piece;
  }

  /** 회전 (벽 밀어내기 포함) */
  rotateCurrent(): void {
    if (this.mode !== "planning" || !this.currentPiece) return;
    const rotated = rotatePiece(this.currentPiece);
    for (const kick of [0, -1, 1, -2, 2]) {
      const kicked = { ...rotated, x: rotated.x + kick };
      if (this.canPlace(kicked)) {
        this.currentPiece = kicked;
        this.sound.play("rotate");
        return;
      }
    }
  }

  /** 현재 피스를 바닥까지 떨어뜨려 잠금 */
  dropCurrent(): void {
    if (this.mode !== "planning" || !this.currentPiece) return;
    // undo 용 스냅샷 (드롭 직전 상태)
    this.history.push({
      grid: cloneGrid(this.grid),
      queueIndex: this.queueIndex,
    });
    let piece = this.currentPiece;
    while (this.canPlace({ ...piece, y: piece.y + 1 })) {
      piece = { ...piece, y: piece.y + 1 };
    }
    const cells = absoluteCells(piece);
    for (const cell of cells) {
      if (cell.y >= 0 && cell.y < ROWS && cell.x >= 0 && cell.x < COLS) {
        this.grid[cell.y][cell.x] = piece.kind;
      }
    }
    this.animation.landedAt = performance.now();
    this.animation.landingCells = cells;
    this.sound.play("land");
    this.clearLines();
    this.queueIndex += 1;
    this.currentPiece = null;
    this.spawnNext();
  }

  /** 직전 드롭을 무름 (히스토리 pop, 피스 다시 스폰) */
  undoLastPlacement(): void {
    if (this.mode !== "planning") return;
    const prev = this.history.pop();
    if (!prev) return;
    this.grid = prev.grid;
    this.queueIndex = prev.queueIndex;
    this.spawnNext();
    this.sound.play("move");
  }

  private computeGhost(): Point[] | null {
    if (this.mode !== "planning" || !this.currentPiece) return null;
    let piece = this.currentPiece;
    while (this.canPlace({ ...piece, y: piece.y + 1 })) {
      piece = { ...piece, y: piece.y + 1 };
    }
    return absoluteCells(piece);
  }

  private clearLines(): void {
    const rows = this.grid
      .map((row, y) => (row.every(Boolean) && !row.some((cell) => cell === "wall") ? y : -1))
      .filter((row) => row >= 0);
    if (!rows.length) return;
    this.animation.clearingRows = rows;
    this.animation.clearStartedAt = performance.now();
    this.grid = this.grid.filter((_, y) => !rows.includes(y));
    while (this.grid.length < ROWS) this.grid.unshift(Array.from({ length: COLS }, () => null));
    this.sound.play("line");
  }

  private evaluate(): void {
    this.attempts += 1;
    const isEmpty = this.grid.every((row) => row.every((cell) => cell === null));
    if (isEmpty) {
      this.mode = "clear";
      this.animation.message = this.attempts === 1 ? "HOLE IN ONE" : `SOLVED IN ${this.attempts}`;
      this.feed[this.feedIndex].cleared = true;
      rememberPuzzle(this.activePuzzle, true);
      this.sound.play("clear");
      this.appendPuzzle();
    } else {
      this.mode = "failed";
      this.animation.message = `MISS — TRY ${this.attempts + 1}`;
      this.sound.play("fail");
    }
    this.animation.messageStartedAt = performance.now();
  }

  retry(): void {
    if (this.mode !== "failed" && this.mode !== "clear") return;
    if (this.mode === "clear") {
      this.attempts = 0;
    }
    this.grid = cloneGrid(this.activePuzzle.grid);
    this.queueIndex = 0;
    this.history = [];
    this.mode = "planning";
    this.animation.message = "";
    this.spawnNext();
  }

  advance(): void {
    if (this.mode !== "clear") return;
    this.attempts = 0;
    this.mode = "feed";
    this.captureFeedTransition();
    this.feedIndex = Math.min(this.feedIndex + 1, this.feed.length - 1);
    this.grid = cloneGrid(this.activePuzzle.grid);
    this.animation.feedSlide = 1.15;
    this.animation.message = "";
    this.currentPiece = null;
  }

  abandon(): void {
    if (this.mode !== "planning") return;
    this.mode = "feed";
    this.attempts = 0;
    this.grid = cloneGrid(this.activePuzzle.grid);
    this.queueIndex = 0;
    this.history = [];
    this.currentPiece = null;
  }

  nextFeed(direction: 1 | -1): void {
    if (this.mode === "planning") return;
    const nextIndex = Math.max(0, this.feedIndex + direction);
    if (nextIndex === this.feedIndex) {
      this.animation.feedSlide = direction * 0.18;
      this.animation.feedSlideX = 0;
      this.animation.feedShake = 1;
      this.sound.play("feed");
      return;
    }
    this.captureFeedTransition();
    if (nextIndex >= this.feed.length - 2) this.appendPuzzle();
    this.feedIndex = Math.min(nextIndex, this.feed.length - 1);
    this.grid = cloneGrid(this.activePuzzle.grid);
    this.attempts = 0;
    this.animation.feedSlide = direction * 1.15;
    this.animation.feedSlideX = 0;
    this.sound.play("feed");
  }

  challengeFeed(): void {
    if (this.mode === "planning") return;
    if (this.activePuzzle.difficulty === "Challenge") return;
    this.captureFeedTransition();
    const seed = this.activePuzzle.seed + 777 + this.feedIndex * 13;
    this.feed.splice(this.feedIndex + 1, 0, { puzzle: createFeedPuzzle(seed, true), cleared: false });
    this.feedIndex += 1;
    this.attempts = 0;
    this.grid = cloneGrid(this.activePuzzle.grid);
    this.animation.feedSlide = 0;
    this.animation.feedSlideX = -1.15;
    this.sound.play("feed");
  }

  returnFromChallenge(): void {
    if (this.mode === "planning" || this.activePuzzle.difficulty !== "Challenge") return;
    if (this.feedIndex > 0) {
      this.captureFeedTransition();
      this.feedIndex -= 1;
      this.attempts = 0;
      this.grid = cloneGrid(this.activePuzzle.grid);
      this.animation.feedSlide = 0;
      this.animation.feedSlideX = 1.15;
      this.sound.play("feed");
    }
  }

  toggleSound(): void {
    this.sound.setEnabled(!this.sound.isEnabled);
    setSoundOn(this.sound.isEnabled);
  }

  copyShareUrl(): void {
    const seed = this.activePuzzle.seed;
    const base = `${window.location.origin}${window.location.pathname}`;
    const url = `${base}?seed=${seed}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(
        () => this.flashToast("LINK COPIED"),
        () => this.flashToast("COPY FAILED"),
      );
    } else {
      this.flashToast("COPY UNAVAILABLE");
    }
  }

  setTouchTrail(points: Array<{ x: number; y: number }>): void {
    this.animation.touchTrail = points;
  }

  private flashToast(msg: string): void {
    this.animation.toast = msg;
    this.animation.toastAt = performance.now();
  }

  private appendPuzzle(): void {
    const seed = this.feed[this.feed.length - 1].puzzle.seed + 101 + this.feed.length * 7;
    this.feed.push({ puzzle: createFeedPuzzle(seed, false), cleared: false });
    this.feed = this.feed.slice(-12);
    this.feedIndex = Math.min(this.feedIndex, this.feed.length - 1);
  }

  private captureFeedTransition(): void {
    this.animation.previousPuzzle = this.activePuzzle;
    this.animation.previousGrid = cloneGrid(this.grid);
  }

  private canPlace(piece: Piece): boolean {
    return absoluteCells(piece).every((cell) => {
      if (cell.x < 0 || cell.x >= COLS || cell.y >= ROWS) return false;
      if (cell.y < 0) return true;
      return !this.grid[cell.y][cell.x];
    });
  }
}

function cloneGrid(grid: Cell[][]): Cell[][] {
  return grid.map((row) => [...row]);
}
