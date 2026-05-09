import { COLS, ROWS, type AnimationState, type Cell, type FeedItem, type GameMode, type GameSnapshot, type Piece, type Point, type Puzzle } from "./gameTypes";
import { absoluteCells, createPiece, rotatePiece } from "./pieces";
import { createFeedPuzzle, createInitialFeed } from "./puzzleGenerator";
import { loadStorage, rememberPuzzle, setSoundOn } from "./storage";
import { SoundSystem } from "./sound";

interface PlacementSnapshot {
  grid: Cell[][];
  selectedIndex: number;
  usedIndices: number[];
  rotation: number;
}

export class Game {
  private mode: GameMode = "feed";
  private feed: FeedItem[];
  private feedIndex = 0;
  private grid: Cell[][];
  private selectedIndex = 0;
  private usedIndices: number[] = [];
  private currentRotation = 0;
  private attempts = 0;
  private placementHistory: PlacementSnapshot[] = [];
  private hoverColumn: number | null = null;
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
      current: null,
      next: this.mode === "planning" ? this.getSelectedKind() : this.activePuzzle.queue[0] ?? null,
      blocksLeft: this.activePuzzle.queue.length - this.usedIndices.length,
      linesCleared: 0,
      feed: this.feed,
      feedIndex: this.feedIndex,
      soundOn: this.sound.isEnabled,
      animation: this.animation,
      queueIndex: this.usedIndices.length,
      attempts: this.attempts,
      currentRotation: this.currentRotation,
      planningGhost: this.computeGhost(),
      selectedIndex: this.selectedIndex,
      usedIndices: [...this.usedIndices],
    };
  }

  setHoverColumn(col: number | null): void {
    if (this.mode !== "planning") {
      this.hoverColumn = null;
      return;
    }
    this.hoverColumn = col;
  }

  setTouchTrail(points: Array<{ x: number; y: number }>): void {
    this.animation.touchTrail = points;
  }

  /** hoverColumn에 현재 선택 피스를 떨어뜨렸을 때 안착 셀들. 없으면 null. */
  private computeGhost(): { cells: Point[]; kind: "I" | "O" | "T" | "L" | "J" | "S" | "Z" } | null {
    if (this.mode !== "planning" || this.hoverColumn === null) return null;
    const kind = this.getSelectedKind();
    if (!kind) return null;
    let piece = createPiece(kind);
    for (let i = 0; i < this.currentRotation; i += 1) {
      piece = rotatePiece(piece);
    }
    piece = { ...piece, x: this.hoverColumn, y: -2 };
    while (this.canPlace({ ...piece, y: piece.y + 1 })) {
      piece = { ...piece, y: piece.y + 1 };
    }
    if (!this.canPlace(piece)) return null;
    return { cells: absoluteCells(piece), kind };
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
    this.usedIndices = [];
    this.selectedIndex = 0;
    this.currentRotation = 0;
    this.attempts = 0;
    this.placementHistory = [];
    this.animation.message = "";
    this.sound.unlock();
  }

  /** 현재 선택된 피스의 종류 (planning 모드 한정) */
  private getSelectedKind(): "I" | "O" | "T" | "L" | "J" | "S" | "Z" | null {
    if (this.selectedIndex < 0 || this.selectedIndex >= this.activePuzzle.queue.length) return null;
    if (this.usedIndices.includes(this.selectedIndex)) return null;
    return this.activePuzzle.queue[this.selectedIndex];
  }

  /** 큐의 i번째 피스 선택 (사용된 피스는 선택 불가) */
  selectPiece(index: number): void {
    if (this.mode !== "planning") return;
    if (index < 0 || index >= this.activePuzzle.queue.length) return;
    if (this.usedIndices.includes(index)) return;
    this.selectedIndex = index;
    this.currentRotation = 0;
    this.sound.play("move");
  }

  rotatePlanningPiece(): void {
    if (this.mode !== "planning") return;
    if (!this.getSelectedKind()) return;
    this.currentRotation = (this.currentRotation + 1) % 4;
    this.sound.play("rotate");
  }

  /** 사용 안 한 다음 인덱스로 selectedIndex 이동 (placement 후 자동 호출) */
  private advanceSelection(): void {
    const total = this.activePuzzle.queue.length;
    for (let offset = 1; offset <= total; offset += 1) {
      const candidate = (this.selectedIndex + offset) % total;
      if (!this.usedIndices.includes(candidate)) {
        this.selectedIndex = candidate;
        return;
      }
    }
    // 다 사용됨 — selectedIndex 그대로 (의미 없음, evaluate가 곧 호출됨)
  }

  /** 클릭한 컬럼에 현재 선택 피스를 떨어뜨려 배치 */
  placeAt(targetX: number): void {
    if (this.mode !== "planning") return;
    const kind = this.getSelectedKind();
    if (!kind) return;

    let piece = createPiece(kind);
    for (let i = 0; i < this.currentRotation; i += 1) {
      piece = rotatePiece(piece);
    }
    piece = { ...piece, x: targetX, y: -2 };

    // 중력 시뮬레이션 — 가장 낮은 가능 위치까지 떨어뜨림
    while (this.canPlace({ ...piece, y: piece.y + 1 })) {
      piece = { ...piece, y: piece.y + 1 };
    }

    if (!this.canPlace(piece)) {
      this.flashToast("CAN'T PLACE");
      return;
    }

    // undo 용 스냅샷
    this.placementHistory.push({
      grid: cloneGrid(this.grid),
      selectedIndex: this.selectedIndex,
      usedIndices: [...this.usedIndices],
      rotation: this.currentRotation,
    });

    // 셀 잠그기
    const cells = absoluteCells(piece);
    for (const cell of cells) {
      if (cell.y >= 0 && cell.y < ROWS && cell.x >= 0 && cell.x < COLS) {
        this.grid[cell.y][cell.x] = piece.kind;
      }
    }

    this.animation.landedAt = performance.now();
    this.animation.landingCells = cells;
    this.sound.play("land");

    // 라인 클리어
    this.clearLines(performance.now());

    this.usedIndices.push(this.selectedIndex);
    this.currentRotation = 0;

    if (this.usedIndices.length >= this.activePuzzle.queue.length) {
      this.evaluate();
    } else {
      this.advanceSelection();
    }
  }

  undoLastPlacement(): void {
    if (this.mode !== "planning") return;
    const prev = this.placementHistory.pop();
    if (!prev) return;
    this.grid = prev.grid;
    this.selectedIndex = prev.selectedIndex;
    this.usedIndices = prev.usedIndices;
    this.currentRotation = prev.rotation;
    this.sound.play("move");
  }

  /** 모든 피스 배치 후 결과 평가 */
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

  /** 실패 후 같은 퍼즐 다시 시도 (attempts 누적) */
  retry(): void {
    if (this.mode !== "failed" && this.mode !== "clear") return;
    if (this.mode === "clear") {
      // 클리어 후 다시 시도하면 카운터 리셋 + 같은 퍼즐
      this.attempts = 0;
    }
    this.grid = cloneGrid(this.activePuzzle.grid);
    this.usedIndices = [];
    this.selectedIndex = 0;
    this.currentRotation = 0;
    this.placementHistory = [];
    this.mode = "planning";
    this.animation.message = "";
  }

  /** 클리어 후 다음 퍼즐로 진행 */
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
    this.usedIndices = [];
    this.selectedIndex = 0;
    this.currentRotation = 0;
    this.placementHistory = [];
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

  private flashToast(msg: string): void {
    this.animation.toast = msg;
    this.animation.toastAt = performance.now();
  }

  private clearLines(_now: number): void {
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
