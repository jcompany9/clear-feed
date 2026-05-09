import {
  COLS,
  ROWS,
  type AnimationState,
  type Cell,
  type FeedItem,
  type GameMode,
  type GameSnapshot,
  type Piece,
  type PieceKind,
  type PlannedGhost,
  type PlannedMove,
  type Point,
  type Puzzle,
} from "./gameTypes";
import { absoluteCells, createPiece, rotatePiece } from "./pieces";
import { createFeedPuzzle, createInitialFeed } from "./puzzleGenerator";
import { loadStorage, rememberPuzzle, setSoundOn } from "./storage";
import { SoundSystem } from "./sound";

export class Game {
  private mode: GameMode = "feed";
  private feed: FeedItem[];
  private feedIndex = 0;
  private grid: Cell[][];
  private plannedMoves: Array<PlannedMove | null> = [];
  private activeEditIndex: number | null = null;
  private currentRotation = 0;
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
    const ghosts = this.computePlannedGhosts();
    return {
      mode: this.mode,
      puzzle: this.activePuzzle,
      grid: this.grid,
      current: null,
      next: this.mode === "planning" ? this.activePieceKind() : this.activePuzzle.queue[0] ?? null,
      blocksLeft: this.plannedMoves.filter((m) => m === null).length,
      linesCleared: 0,
      feed: this.feed,
      feedIndex: this.feedIndex,
      soundOn: this.sound.isEnabled,
      animation: this.animation,
      attempts: this.attempts,
      activeEditIndex: this.activeEditIndex,
      currentRotation: this.currentRotation,
      plannedMoves: this.plannedMoves.slice(),
      plannedGhosts: ghosts,
      canExecute: this.mode === "planning" && this.plannedMoves.every((m) => m !== null) && ghosts.every((g) => g.valid),
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
    this.plannedMoves = this.activePuzzle.queue.map(() => null);
    this.activeEditIndex = 0;
    this.currentRotation = 0;
    this.attempts = 0;
    this.animation.message = "";
    this.sound.unlock();
  }

  /** 현재 active 피스의 kind */
  private activePieceKind(): PieceKind | null {
    if (this.activeEditIndex === null) return null;
    if (this.activeEditIndex < 0 || this.activeEditIndex >= this.activePuzzle.queue.length) return null;
    return this.activePuzzle.queue[this.activeEditIndex];
  }

  selectPiece(index: number): void {
    if (this.mode !== "planning") return;
    if (index < 0 || index >= this.activePuzzle.queue.length) return;
    this.activeEditIndex = index;
    // 기존 계획이 있으면 해당 회전 복원, 없으면 0
    this.currentRotation = this.plannedMoves[index]?.rotation ?? 0;
    this.sound.play("move");
  }

  rotatePlanningPiece(): void {
    if (this.mode !== "planning" || this.activeEditIndex === null) return;
    this.currentRotation = (this.currentRotation + 1) % 4;
    // 이미 계획된 피스라면 회전만 업데이트 (x는 유지)
    const idx = this.activeEditIndex;
    const existing = this.plannedMoves[idx];
    if (existing) {
      this.plannedMoves[idx] = { x: existing.x, rotation: this.currentRotation };
    }
    this.sound.play("rotate");
  }

  /** 보드 컬럼 클릭/드래그 — active 피스의 계획 위치를 그 컬럼으로 설정 */
  placeAt(targetX: number): void {
    if (this.mode !== "planning" || this.activeEditIndex === null) return;
    const idx = this.activeEditIndex;
    this.plannedMoves[idx] = { x: targetX, rotation: this.currentRotation };
    this.sound.play("land");
    // 다음 미계획 피스로 자동 이동
    this.advanceActiveToNext();
  }

  private advanceActiveToNext(): void {
    const queueLen = this.activePuzzle.queue.length;
    if (this.activeEditIndex === null) return;
    for (let offset = 1; offset <= queueLen; offset += 1) {
      const candidate = (this.activeEditIndex + offset) % queueLen;
      if (this.plannedMoves[candidate] === null) {
        this.activeEditIndex = candidate;
        this.currentRotation = 0;
        return;
      }
    }
    // 모두 계획됨 — active 그대로 유지 (다시 편집 가능)
  }

  undoLastPlacement(): void {
    if (this.mode !== "planning") return;
    // 가장 최근에 계획한 피스를 미계획으로 되돌림
    // plannedMoves가 array이고 어떤 게 "마지막"인지 모르므로,
    // active 피스를 미계획으로 되돌림
    if (this.activeEditIndex !== null && this.plannedMoves[this.activeEditIndex] !== null) {
      this.plannedMoves[this.activeEditIndex] = null;
      this.currentRotation = 0;
      this.sound.play("move");
    }
  }

  /** 모든 계획을 비우고 재시작 (active = 0) */
  clearAllPlans(): void {
    if (this.mode !== "planning") return;
    this.plannedMoves = this.activePuzzle.queue.map(() => null);
    this.activeEditIndex = 0;
    this.currentRotation = 0;
  }

  /** START — 계획대로 모든 피스를 순차 적용 */
  executePlan(): void {
    if (this.mode !== "planning") return;
    if (!this.plannedMoves.every((m) => m !== null)) {
      this.flashToast("PLAN INCOMPLETE");
      return;
    }
    let workingGrid = cloneGrid(this.grid);
    const queueLen = this.activePuzzle.queue.length;
    for (let i = 0; i < queueLen; i += 1) {
      const move = this.plannedMoves[i]!;
      const kind = this.activePuzzle.queue[i];
      const piece = simulateDrop(workingGrid, kind, move.x, move.rotation);
      if (!piece) {
        // 배치 불가 — 시뮬레이션 실패
        continue;
      }
      const cells = absoluteCells(piece);
      cells.forEach((cell) => {
        if (cell.y >= 0 && cell.y < ROWS && cell.x >= 0 && cell.x < COLS) {
          workingGrid[cell.y][cell.x] = kind;
        }
      });
      workingGrid = clearGridLines(workingGrid);
    }
    this.grid = workingGrid;
    this.evaluate();
  }

  /** 시뮬레이션 — 모든 plannedMoves 적용한 후의 ghost 위치들 */
  private computePlannedGhosts(): PlannedGhost[] {
    if (this.mode !== "planning") return [];
    const result: PlannedGhost[] = [];
    let workingGrid = cloneGrid(this.grid);
    const queueLen = this.activePuzzle.queue.length;
    for (let i = 0; i < queueLen; i += 1) {
      const move = this.plannedMoves[i];
      if (move === null) continue;
      const kind = this.activePuzzle.queue[i];
      const piece = simulateDrop(workingGrid, kind, move.x, move.rotation);
      const isActive = i === this.activeEditIndex;
      if (!piece) {
        result.push({ cells: [], kind, queueIndex: i, isActive, valid: false });
        continue;
      }
      const cells = absoluteCells(piece);
      result.push({ cells, kind, queueIndex: i, isActive, valid: true });
      cells.forEach((cell) => {
        if (cell.y >= 0 && cell.y < ROWS && cell.x >= 0 && cell.x < COLS) {
          workingGrid[cell.y][cell.x] = kind;
        }
      });
      workingGrid = clearGridLines(workingGrid);
    }
    return result;
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
    this.plannedMoves = this.activePuzzle.queue.map(() => null);
    this.activeEditIndex = 0;
    this.currentRotation = 0;
    this.mode = "planning";
    this.animation.message = "";
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
  }

  abandon(): void {
    if (this.mode !== "planning") return;
    this.mode = "feed";
    this.attempts = 0;
    this.grid = cloneGrid(this.activePuzzle.grid);
    this.plannedMoves = [];
    this.activeEditIndex = null;
    this.currentRotation = 0;
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

  setHoverColumn(_col: number | null): void {
    // hover preview deprecated — 모든 미리보기는 plannedGhosts로 통합
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
}

function cloneGrid(grid: Cell[][]): Cell[][] {
  return grid.map((row) => [...row]);
}

function canPlaceOn(grid: Cell[][], piece: Piece): boolean {
  return absoluteCells(piece).every((cell) => {
    if (cell.x < 0 || cell.x >= COLS || cell.y >= ROWS) return false;
    if (cell.y < 0) return true;
    return !grid[cell.y][cell.x];
  });
}

/** kind 피스를 (x, rotation)으로 grid에 떨어뜨려 안착시키는 시뮬레이션 — 안착 가능하면 piece 반환 */
function simulateDrop(grid: Cell[][], kind: PieceKind, x: number, rotation: number): Piece | null {
  let piece = createPiece(kind);
  for (let i = 0; i < rotation; i += 1) piece = rotatePiece(piece);
  piece = { ...piece, x, y: -2 };
  while (canPlaceOn(grid, { ...piece, y: piece.y + 1 })) {
    piece = { ...piece, y: piece.y + 1 };
  }
  if (!canPlaceOn(grid, piece)) return null;
  return piece;
}

function clearGridLines(grid: Cell[][]): Cell[][] {
  const rows = grid
    .map((row, y) => (row.every(Boolean) && !row.some((cell) => cell === "wall") ? y : -1))
    .filter((row) => row >= 0);
  if (!rows.length) return grid;
  let result = grid.filter((_, y) => !rows.includes(y));
  while (result.length < ROWS) {
    result = [Array.from({ length: COLS }, () => null), ...result];
  }
  return result;
}
