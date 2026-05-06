import { COLS, ROWS, type AnimationState, type Cell, type FeedItem, type GameMode, type GameSnapshot, type Piece, type Point, type Puzzle } from "./gameTypes";
import { absoluteCells, createPiece, rotatePiece } from "./pieces";
import { createFeedPuzzle, createInitialFeed } from "./puzzleGenerator";
import { loadStorage, rememberPuzzle, setSoundOn } from "./storage";
import { SoundSystem } from "./sound";

const GRAVITY_MS = 620;
const LOCK_DELAY_MS = 280;

export class Game {
  private mode: GameMode = "feed";
  private feed: FeedItem[];
  private feedIndex = 0;
  private grid: Cell[][];
  private current: Piece | null = null;
  private queue: Puzzle["queue"] = [];
  private blocksLeft = 0;
  private linesCleared = 0;
  private lastFallAt = performance.now();
  private touchingFloorAt = 0;
  private sound: SoundSystem;
  private animation: AnimationState = {
    landedAt: 0,
    landingCells: [] as Point[],
    clearingRows: [] as number[],
    clearStartedAt: 0,
    message: "",
    messageStartedAt: 0,
    feedSlide: 0,
    feedSlideX: 0,
    feedShake: 0,
  };

  constructor(sound: SoundSystem) {
    this.sound = sound;
    const saved = loadStorage();
    this.sound.setEnabled(saved.soundOn);
    this.feed = createInitialFeed(6, saved.lastSeed + 17).map((puzzle) => ({ puzzle, cleared: false }));
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
      current: this.current,
      next: this.queue[0] ?? null,
      blocksLeft: this.blocksLeft,
      linesCleared: this.linesCleared,
      feed: this.feed,
      feedIndex: this.feedIndex,
      soundOn: this.sound.isEnabled,
      animation: this.animation,
    };
  }

  update(now: number): void {
    this.animation.feedSlide *= 0.86;
    this.animation.feedSlideX *= 0.86;
    this.animation.feedShake *= 0.78;
    if (Math.abs(this.animation.feedSlide) < 0.015 && Math.abs(this.animation.feedSlideX) < 0.015) {
      this.animation.previousPuzzle = undefined;
      this.animation.previousGrid = undefined;
    }
    if (this.mode !== "playing" || !this.current) return;
    if (now - this.lastFallAt > GRAVITY_MS) {
      this.softDrop(now);
    }
    if (this.isTouchingFloor() && this.touchingFloorAt && now - this.touchingFloorAt > LOCK_DELAY_MS) {
      this.lockPiece(now);
    }
  }

  startPlaying(): void {
    if (this.mode === "playing") return;
    this.mode = "playing";
    this.grid = cloneGrid(this.activePuzzle.grid);
    this.queue = [...this.activePuzzle.queue];
    this.blocksLeft = this.activePuzzle.movesLimit;
    this.linesCleared = 0;
    this.animation.message = "";
    this.spawnNext();
    this.sound.unlock();
  }

  nextFeed(direction: 1 | -1): void {
    if (this.mode === "playing") return;
    const nextIndex = Math.max(0, this.feedIndex + direction);
    if (nextIndex === this.feedIndex) {
      this.animation.feedSlide = direction * 0.18;
      this.animation.feedSlideX = 0;
      this.animation.feedShake = 1;
      this.sound.play("feed");
      return;
    }
    this.captureFeedTransition();
    if (nextIndex >= this.feed.length - 2) this.appendPuzzle(false);
    this.feedIndex = Math.min(nextIndex, this.feed.length - 1);
    this.grid = cloneGrid(this.activePuzzle.grid);
    this.animation.feedSlide = direction * 1.15;
    this.animation.feedSlideX = 0;
    this.sound.play("feed");
  }

  challengeFeed(): void {
    if (this.mode === "playing") return;
    if (this.activePuzzle.difficulty === "Challenge") return;
    this.captureFeedTransition();
    const seed = this.activePuzzle.seed + 777 + this.feedIndex * 13;
    this.feed.splice(this.feedIndex + 1, 0, { puzzle: createFeedPuzzle(seed, true), cleared: false });
    this.feedIndex += 1;
    this.grid = cloneGrid(this.activePuzzle.grid);
    this.animation.feedSlide = 0;
    this.animation.feedSlideX = -1.15;
    this.sound.play("feed");
  }

  returnFromChallenge(): void {
    if (this.mode === "playing" || this.activePuzzle.difficulty !== "Challenge") return;
    if (this.feedIndex > 0) {
      this.captureFeedTransition();
      this.feedIndex -= 1;
      this.grid = cloneGrid(this.activePuzzle.grid);
      this.animation.feedSlide = 0;
      this.animation.feedSlideX = 1.15;
      this.sound.play("feed");
    }
  }

  otherFeed(): void {
    if (this.mode === "playing") return;
    this.captureFeedTransition();
    const seed = this.activePuzzle.seed + 1301 + Math.floor(performance.now());
    this.feed.splice(this.feedIndex + 1, 0, { puzzle: createFeedPuzzle(seed, false), cleared: false });
    this.feedIndex += 1;
    this.feed = this.feed.slice(-12);
    this.grid = cloneGrid(this.activePuzzle.grid);
    this.animation.feedSlide = 1.15;
    this.animation.feedSlideX = 0;
    this.sound.play("feed");
  }

  move(dx: -1 | 1): void {
    if (!this.current || this.mode !== "playing") return;
    const moved = { ...this.current, x: this.current.x + dx };
    if (this.canPlace(moved)) {
      this.current = moved;
      this.touchingFloorAt = 0;
      this.sound.play("move");
    }
  }

  rotate(): void {
    if (!this.current || this.mode !== "playing") return;
    const rotated = rotatePiece(this.current);
    for (const kick of [0, -1, 1, -2, 2]) {
      const kicked = { ...rotated, x: rotated.x + kick };
      if (this.canPlace(kicked)) {
        this.current = kicked;
        this.touchingFloorAt = 0;
        this.sound.play("rotate");
        return;
      }
    }
  }

  hardDrop(): void {
    if (!this.current || this.mode !== "playing") return;
    let piece = this.current;
    while (this.canPlace({ ...piece, y: piece.y + 1 })) {
      piece = { ...piece, y: piece.y + 1 };
    }
    this.current = piece;
    this.lockPiece(performance.now());
  }

  retry(): void {
    this.startPlaying();
  }

  abandon(): void {
    if (this.mode !== "playing") return;
    this.end(false, "Almost");
  }

  toggleSound(): void {
    this.sound.setEnabled(!this.sound.isEnabled);
    setSoundOn(this.sound.isEnabled);
  }

  private softDrop(now: number): void {
    if (!this.current) return;
    const moved = { ...this.current, y: this.current.y + 1 };
    if (this.canPlace(moved)) {
      this.current = moved;
      this.touchingFloorAt = 0;
    } else if (!this.touchingFloorAt) {
      this.touchingFloorAt = now;
    }
    this.lastFallAt = now;
  }

  private lockPiece(now: number): void {
    if (!this.current) return;
    const cells = absoluteCells(this.current);
    for (const cell of cells) {
      if (cell.y >= 0 && cell.y < ROWS && cell.x >= 0 && cell.x < COLS) {
        this.grid[cell.y][cell.x] = this.current.kind;
      }
    }
    this.animation.landedAt = now;
    this.animation.landingCells = cells;
    this.blocksLeft -= 1;
    this.sound.play("land");
    this.clearLines(now);
    if (this.linesCleared >= this.activePuzzle.targetLines) {
      this.end(true, this.linesCleared > this.activePuzzle.targetLines ? "PERFECT" : "CLEAR");
      return;
    }
    if (this.blocksLeft <= 0) {
      this.end(false, "One More?");
      return;
    }
    this.spawnNext();
  }

  private clearLines(now: number): void {
    const rows = this.grid
      .map((row, y) => (row.every(Boolean) ? y : -1))
      .filter((row) => row >= 0);
    if (!rows.length) return;
    this.animation.clearingRows = rows;
    this.animation.clearStartedAt = now;
    this.linesCleared += rows.length;
    this.grid = this.grid.filter((_, y) => !rows.includes(y));
    while (this.grid.length < ROWS) this.grid.unshift(Array.from({ length: COLS }, () => null));
    this.sound.play("line");
  }

  private spawnNext(): void {
    const next = this.queue.shift();
    if (!next) {
      this.end(false, "Try Again");
      return;
    }
    this.current = createPiece(next);
    this.current.y = 1;
    this.lastFallAt = performance.now();
    this.touchingFloorAt = 0;
    if (!this.canPlace(this.current)) {
      this.end(false, "Try Again");
    }
  }

  private end(cleared: boolean, message: string): void {
    this.mode = cleared ? "clear" : "failed";
    this.animation.message = cleared ? message : message;
    this.animation.messageStartedAt = performance.now();
    this.feed[this.feedIndex].cleared = cleared;
    rememberPuzzle(this.activePuzzle, cleared);
    this.sound.play(cleared ? "clear" : "fail");
    this.current = null;
    this.appendPuzzle(false);
  }

  private appendPuzzle(challenge: boolean): void {
    const seed = this.feed[this.feed.length - 1].puzzle.seed + 101 + this.feed.length * 7;
    this.feed.push({ puzzle: createFeedPuzzle(seed, challenge), cleared: false });
    this.feed = this.feed.slice(-12);
    this.feedIndex = Math.min(this.feedIndex, this.feed.length - 1);
  }

  private captureFeedTransition(): void {
    this.animation.previousPuzzle = this.activePuzzle;
    this.animation.previousGrid = cloneGrid(this.grid);
  }

  private isTouchingFloor(): boolean {
    return Boolean(this.current && !this.canPlace({ ...this.current, y: this.current.y + 1 }));
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
