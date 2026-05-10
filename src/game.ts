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
  type Point,
  type Puzzle,
} from "./gameTypes";
import { absoluteCells, createPiece, rotatePiece } from "./pieces";
import { createFeedPuzzle, createInitialFeed } from "./puzzleGenerator";
import { generateShufflePuzzle } from "./game/adaptPuzzle";
import { CURATED_PUZZLES, pickCuratedPuzzle } from "./curatedPuzzles";
import { getPuzzlePool } from "./puzzlePool";
import { findSolvableQueue } from "./solver";
import SolverWorker from "./solverWorker?worker";
import { encodePuzzle } from "./encoding";
import { loadStorage, rememberPuzzle, setSoundOn } from "./storage";
import { SoundSystem } from "./sound";

interface GenerateResult {
  queue: PieceKind[];
  attempts: number;
}

interface WorkerResponseData {
  id: number;
  found: GenerateResult | null;
}

export interface GameOptions {
  /** false면 솔버를 메인 스레드에서 동기 실행 (테스트용). 기본 true (Web Worker). */
  useWorker?: boolean;
}

interface PlacementSnapshot {
  grid: Cell[][];
  queueIndex: number;
  linesCleared: number;
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
  private linesCleared = 0;
  private pressedControl: string | null = null;
  private editGrid: Cell[][] = [];
  private editQueueLength = 5;
  private editFoundQueue: PieceKind[] | null = null;
  private editStatus: "idle" | "generating" | "ready" | "no-solution" = "idle";
  private editPieceQueue: PieceKind[] = [];
  private editSolutionEstimate = 0;
  private editAnalyzing = false;
  private editTool: "cell" | PieceKind = "cell";
  private editToolRotation = 0;
  private editHoverPos: { col: number; row: number } | null = null;
  private useWorker: boolean;
  private solverWorker: Worker | null = null;
  private nextWorkerId = 0;
  private pendingWorkerId: number | null = null;
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
    editShake: 0,
    touchTrail: [],
  };

  constructor(sound: SoundSystem, initialSeed?: number, initialPuzzle?: Puzzle, opts: GameOptions = {}) {
    this.sound = sound;
    this.useWorker = opts.useWorker ?? true;
    const saved = loadStorage();
    this.sound.setEnabled(saved.soundOn);
    const seedBase = initialSeed ?? saved.lastSeed + 17;
    if (initialPuzzle) {
      // ?p=...로 받은 사용자 퍼즐을 첫 슬롯에, 그 뒤로 시드 기반 퍼즐 추가 (피드 다양성)
      // 시작 시 1개만 sync 생성 (앱 부팅 빠르게), 나머지는 워커 풀에서 백그라운드 충전
      const more = createInitialFeed(1, seedBase).map((puzzle) => ({ puzzle, cleared: false }));
      this.feed = [{ puzzle: initialPuzzle, cleared: false }, ...more];
    } else {
      // 시작 시 2개만 sync, 나머지는 워커가 채움
      this.feed = createInitialFeed(2, seedBase).map((puzzle) => ({ puzzle, cleared: false }));
    }
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
      linesCleared: this.linesCleared,
      feed: this.feed,
      feedIndex: this.feedIndex,
      soundOn: this.sound.isEnabled,
      animation: this.animation,
      attempts: this.attempts,
      queueIndex: this.queueIndex,
      ghostCells: this.computeGhost(),
      pressedControl: this.pressedControl,
      editGrid: this.editGrid.map((row) => [...row]),
      editQueueLength: this.editQueueLength,
      editFoundQueue: this.editFoundQueue ? [...this.editFoundQueue] : null,
      editStatus: this.editStatus,
      editPieceQueue: [...this.editPieceQueue],
      editSolutionEstimate: this.editSolutionEstimate,
      editAnalyzing: this.editAnalyzing,
      editTool: this.editTool,
      editToolRotation: this.editToolRotation,
      editFeasibleLengths: this.computeFeasibleLengths(),
      editHoverGhost: this.computeEditGhost(),
    };
  }

  /** 편집 모드 호버 위치 갱신 (마우스 이동 또는 터치 드래그) */
  setEditHoverPos(pos: { col: number; row: number } | null): void {
    if (this.mode !== "editing") {
      this.editHoverPos = null;
      return;
    }
    this.editHoverPos = pos;
  }

  /**
   * 편집 모드 ghost: 현재 도구가 피스고 hover 위치 있으면 그 자리에 떨어질 셀들.
   * 도구가 'cell'이면 단일 셀 하이라이트.
   */
  private computeEditGhost(): { cells: Point[]; kind: PieceKind | "cell"; valid: boolean } | null {
    if (this.mode !== "editing" || this.editHoverPos === null) return null;
    const { col, row } = this.editHoverPos;
    if (this.editTool === "cell") {
      // 단일 셀 하이라이트
      return {
        cells: [{ x: col, y: row }],
        kind: "cell",
        valid: col >= 0 && col < COLS && row >= 0 && row < ROWS,
      };
    }
    // 피스 도구: drop-from-top — col 의 안착 위치 미리보기
    const landed = this.computeEditDrop(col);
    if (!landed) {
      // 컬럼 막힘 — 빈 ghost (보여줄 위치 없음)
      return { cells: [], kind: this.editTool, valid: false };
    }
    const cells = absoluteCells(landed).filter((c) => c.y >= 0 && c.y < ROWS && c.x >= 0 && c.x < COLS);
    return { cells, kind: this.editTool, valid: true };
  }

  /** 수학적으로 풀이 가능한 큐 길이 (1~10 범위). (cellCount + 4q) % 10 === 0 만족하는 q. */
  private computeFeasibleLengths(): number[] {
    if (this.mode !== "editing") return [];
    const cellCount = this.countEditCells();
    if (cellCount === 0) return [];
    const result: number[] = [];
    for (let q = 1; q <= 10; q += 1) {
      if ((cellCount + q * 4) % 10 === 0) result.push(q);
    }
    return result;
  }

  private countEditCells(): number {
    let n = 0;
    for (const row of this.editGrid) {
      for (const c of row) if (c !== null) n += 1;
    }
    return n;
  }

  update(_now: number): void {
    this.animation.feedSlide *= 0.86;
    this.animation.feedSlideX *= 0.86;
    this.animation.feedShake *= 0.78;
    this.animation.editShake *= 0.82;
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
    this.linesCleared = 0;
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

  /**
   * 현재 피스를 바닥/스택까지 떨어뜨리되 잠금 안 함.
   * 떨어진 후에도 좌/우 이동, 회전 가능 — T-spin, 처마 슬라이드 같은 스킬 플레이.
   * 잠그려면 dropCurrent() 호출.
   */
  slideToFloor(): void {
    if (this.mode !== "planning" || !this.currentPiece) return;
    let piece = this.currentPiece;
    let moved = false;
    while (this.canPlace({ ...piece, y: piece.y + 1 })) {
      piece = { ...piece, y: piece.y + 1 };
      moved = true;
    }
    if (moved) {
      this.currentPiece = piece;
      this.sound.play("move");
    }
  }

  /** 한 칸 아래로 (soft drop). 더 못 내려가면 무시 — 잠금은 dropCurrent로. */
  moveDown(): void {
    if (this.mode !== "planning" || !this.currentPiece) return;
    const moved = { ...this.currentPiece, y: this.currentPiece.y + 1 };
    if (this.canPlace(moved)) {
      this.currentPiece = moved;
      this.sound.play("move");
    }
  }

  /**
   * 똑똑한 ▼ 단일 탭: 공중이면 1칸 아래로, 바닥에 있으면 잠금.
   */
  dropOrLock(): void {
    if (this.mode !== "planning" || !this.currentPiece) return;
    const canFall = this.canPlace({ ...this.currentPiece, y: this.currentPiece.y + 1 });
    if (canFall) {
      this.moveDown();
    } else {
      this.dropCurrent();
    }
  }

  /** 현재 피스가 바닥/스택 위에 있는지 (더 떨어질 곳이 없는지) — UI에서 잠금 가능 표시용 */
  get isPieceOnFloor(): boolean {
    if (!this.currentPiece) return false;
    return !this.canPlace({ ...this.currentPiece, y: this.currentPiece.y + 1 });
  }

  /** 현재 피스를 바닥까지 떨어뜨려 잠금 (하드 드롭) */
  dropCurrent(): void {
    if (this.mode !== "planning" || !this.currentPiece) return;
    // undo 용 스냅샷 (드롭 직전 상태)
    this.history.push({
      grid: cloneGrid(this.grid),
      queueIndex: this.queueIndex,
      linesCleared: this.linesCleared,
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
    // 목표 라인 달성 즉시 CLEAR (큐 소진 기다리지 않음)
    if (this.linesCleared >= this.activePuzzle.targetLines && this.activePuzzle.targetLines > 0) {
      this.evaluate();
      return;
    }
    this.spawnNext();
  }

  /** 직전 드롭을 무름 (히스토리 pop, 피스 다시 스폰) */
  undoLastPlacement(): void {
    if (this.mode !== "planning") return;
    const prev = this.history.pop();
    if (!prev) return;
    this.grid = prev.grid;
    this.queueIndex = prev.queueIndex;
    this.linesCleared = prev.linesCleared;
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

  /** 가득 찬 줄 제거 + 위 블록 낙하. 제거된 라인 수 반환. */
  private clearLines(): number {
    const rows = this.grid
      .map((row, y) => (row.every(Boolean) && !row.some((cell) => cell === "wall") ? y : -1))
      .filter((row) => row >= 0);
    if (!rows.length) return 0;
    this.animation.clearingRows = rows;
    this.animation.clearStartedAt = performance.now();
    this.grid = this.grid.filter((_, y) => !rows.includes(y));
    while (this.grid.length < ROWS) this.grid.unshift(Array.from({ length: COLS }, () => null));
    this.sound.play("line");
    this.linesCleared += rows.length;
    return rows.length;
  }

  private evaluate(): void {
    this.attempts += 1;
    const target = this.activePuzzle.targetLines;
    // 목표 라인 도달 = CLEAR (보드에 블록 남아 있어도 OK)
    // target 0 (UGC 사용자 퍼즐) 인 경우엔 perfect-clear 폴백
    const isEmpty = this.grid.every((row) => row.every((cell) => cell === null));
    const success = target > 0 ? this.linesCleared >= target : isEmpty;
    if (success) {
      this.mode = "clear";
      const stars =
        this.attempts === 1 ? "★★★" : this.attempts === 2 ? "★★" : "★";
      this.animation.message = this.attempts === 1
        ? `${stars} HOLE IN ONE`
        : `${stars} SOLVED IN ${this.attempts}`;
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
    if (this.mode !== "failed" && this.mode !== "clear" && this.mode !== "planning") return;
    if (this.mode === "clear") {
      this.attempts = 0;
    } else if (this.mode === "planning") {
      // 진행 중 재시작 = 현재 시도 포기 → 새 시도 시작 (attempts 1 증가)
      this.attempts += 1;
    }
    this.grid = cloneGrid(this.activePuzzle.grid);
    this.queueIndex = 0;
    this.history = [];
    this.linesCleared = 0;
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
    this.linesCleared = 0;
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

  /** 피드 셔플 — Easy/Normal 새 퍼즐 (둘 다 constructed → 즉시 생성).
   *  Challenge 는 솔버 검증으로 ~수초 블로킹 → 셔플에선 제외. */
  shuffleFeed(): void {
    if (this.mode !== "feed") return;
    this.captureFeedTransition();
    // 우선순위:
    //   1. 큐레이션 풀 (사람 디자인 + AI 검증) — 50% 확률
    //   2. 워커 풀 (즉시)
    //   3. sync 신규 솔버 (~수초)
    //   4. 옛 보장된 폴백
    const seed = this.activePuzzle.seed + 91 + this.feedIndex * 31 + Math.floor(Math.random() * 1000);
    const useCurated = CURATED_PUZZLES.length > 0 && Math.random() < 0.5;
    const curated = useCurated ? pickCuratedPuzzle(seed) : null;
    const pooled = curated ? null : getPuzzlePool().pop();
    const puzzle = curated ?? pooled ?? generateShufflePuzzle(seed) ?? createFeedPuzzle(seed, false);
    this.feed.splice(this.feedIndex + 1, 0, { puzzle, cleared: false });
    this.feedIndex += 1;
    this.attempts = 0;
    this.linesCleared = 0;
    this.grid = cloneGrid(this.activePuzzle.grid);
    this.animation.feedSlide = 1.15;
    this.animation.feedSlideX = 0;
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

  // ──────── Editor (UGC) ────────

  enterEditor(): void {
    if (this.mode !== "feed") return;
    this.mode = "editing";
    this.editGrid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null as Cell));
    this.editQueueLength = 5;
    this.editFoundQueue = null;
    this.editStatus = "idle";
    this.editTool = "I";  // 기본은 첫 큐 피스로 곧 갱신됨
    this.editToolRotation = 0;
    this.editPieceQueue = [];
    this.editSolutionEstimate = 0;
    this.editAnalyzing = false;
    this.refillEditPieceQueue();
    if (this.editPieceQueue.length > 0) this.editTool = this.editPieceQueue[0];
  }

  /** 에디터 큐를 5개 이상으로 보충 (연속 중복 방지) */
  private refillEditPieceQueue(): void {
    const all: PieceKind[] = ["I", "O", "T", "L", "J", "S", "Z"];
    while (this.editPieceQueue.length < 5) {
      let pick = all[Math.floor(Math.random() * all.length)];
      const last = this.editPieceQueue[this.editPieceQueue.length - 1];
      if (last !== undefined && pick === last) {
        // 한 번 더 뽑아서 중복 회피
        pick = all[Math.floor(Math.random() * all.length)];
      }
      this.editPieceQueue.push(pick);
    }
  }

  setEditTool(tool: "cell" | PieceKind): void {
    if (this.mode !== "editing") return;
    this.editTool = tool;
    this.editToolRotation = 0;
    this.sound.play("move");
  }

  rotateEditTool(): void {
    if (this.mode !== "editing") return;
    if (this.editTool === "cell") return; // 셀 모드는 회전 의미 없음
    this.editToolRotation = (this.editToolRotation + 1) % 4;
    this.sound.play("rotate");
  }

  /** 에디터 배치 — 실제 테트리스 모드:
   *  큐의 현재 피스를 col 컬럼에 떨어뜨림. 라인이 클리어되면 거부 (퍼즐 초기 상태에 부적합).
   *  cell 도구는 legacy 토글 유지 (수동 미세 조정). */
  editPlaceAt(col: number, row: number): void {
    if (this.mode !== "editing") return;
    if (this.editTool === "cell") {
      this.editToggleCell(col, row);
      return;
    }
    // 큐의 현재 피스로 강제 (사용자가 임의 선택 못 함)
    const currentPiece = this.editPieceQueue[0];
    if (!currentPiece) return;
    if (this.editTool !== currentPiece) {
      this.editTool = currentPiece;  // 동기화
      this.editToolRotation = 0;
    }
    const landed = this.computeEditDrop(col);
    if (!landed) {
      this.flashToast("BLOCKED — TRY ANOTHER COLUMN");
      this.animation.editShake = 1;
      this.sound.play("fail");
      return;
    }
    const cells = absoluteCells(landed);
    // 시뮬레이션: 가상으로 배치 후 라인 클리어 발생 여부 검사
    const wouldClear = this.simulateLineClearAfterPlace(cells);
    if (wouldClear) {
      this.flashToast("LINE CLEAR — INVALID FOR PUZZLE");
      this.animation.editShake = 1;
      this.sound.play("fail");
      return;
    }
    // OK — 실제 배치
    for (const cell of cells) {
      if (cell.y >= 0 && cell.y < ROWS && cell.x >= 0 && cell.x < COLS) {
        this.editGrid[cell.y][cell.x] = currentPiece as Cell;
      }
    }
    // 큐 진행 + 보충
    this.editPieceQueue.shift();
    this.refillEditPieceQueue();
    this.editTool = this.editPieceQueue[0] ?? "I";
    this.editToolRotation = 0;
    this.editFoundQueue = null;
    this.editStatus = "idle";
    this.sound.play("land");
    // 비동기 분석 (셀이 충분할 때만 — 비싼 작업)
    this.runEditAnalysisAsync();
  }

  private simulateLineClearAfterPlace(cells: Point[]): boolean {
    // 배치하면 가득 차는 행이 있는지만 검사
    const affected = new Set<number>();
    for (const c of cells) {
      if (c.y >= 0 && c.y < ROWS) affected.add(c.y);
    }
    for (const y of affected) {
      let full = true;
      for (let x = 0; x < COLS; x += 1) {
        const filled = this.editGrid[y][x] !== null || cells.some((c) => c.x === x && c.y === y);
        if (!filled) { full = false; break; }
      }
      if (full) return true;
    }
    return false;
  }

  /** 배치 후 비동기로 풀이 가능한 큐 개수 추정.
   *  너무 자주 호출되지 않도록 셀 수 < 6 일 때는 스킵. */
  private runEditAnalysisAsync(): void {
    const cellCount = this.countEditCells();
    if (cellCount < 6) {
      this.editSolutionEstimate = 0;
      return;
    }
    // 동기 실행 (작은 budget) — UX 끊김 최소화
    this.editAnalyzing = true;
    setTimeout(() => {
      const feasible = this.computeFeasibleLengths();
      let solutionsFound = 0;
      // 가장 짧은 가능 큐 길이로 시도
      const length = feasible[0];
      if (length !== undefined) {
        const found = findSolvableQueue(this.editGrid, length, 8, Math.random, 25000, 0);
        if (found) solutionsFound = 1;  // 1개 이상 존재 — 추후 다중 분석 가능
      }
      this.editSolutionEstimate = solutionsFound;
      this.editAnalyzing = false;
    }, 0);
  }

  /** 편집 보드에서 현재 도구(piece)를 col 컬럼에 떨어뜨릴 때 안착 위치 반환.
   *  도구가 cell 이거나 어떤 위치에서도 못 놓이면 null. */
  private computeEditDrop(col: number): Piece | null {
    if (this.mode !== "editing" || this.editTool === "cell") return null;
    let piece = createPiece(this.editTool);
    for (let i = 0; i < this.editToolRotation; i += 1) piece = rotatePiece(piece);
    piece = { ...piece, x: col, y: -2 };
    if (!this.canPlaceOnEditGrid(piece)) {
      // 시작 위치(맨 위)도 못 놓이면 컬럼 자체가 막힘
      return null;
    }
    while (this.canPlaceOnEditGrid({ ...piece, y: piece.y + 1 })) {
      piece = { ...piece, y: piece.y + 1 };
    }
    return piece;
  }

  private canPlaceOnEditGrid(piece: Piece): boolean {
    return absoluteCells(piece).every((cell) => {
      if (cell.x < 0 || cell.x >= COLS || cell.y >= ROWS) return false;
      if (cell.y < 0) return true;  // 보드 위 영역은 OK (스폰 공간)
      return !this.editGrid[cell.y][cell.x];
    });
  }

  /** 편집 보드의 (x, y) 셀 토글 (빈 ↔ "garbage") */
  editToggleCell(x: number, y: number): void {
    if (this.mode !== "editing") return;
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return;
    this.editGrid[y][x] = this.editGrid[y][x] === null ? ("garbage" as Cell) : null;
    // 보드가 바뀌면 이전 결과 무효화
    this.editFoundQueue = null;
    this.editStatus = "idle";
    this.sound.play("move");
  }

  setEditQueueLength(delta: number): void {
    if (this.mode !== "editing") return;
    const next = this.editQueueLength + delta;
    if (next < 1 || next > 10) return;
    this.editQueueLength = next;
    this.editFoundQueue = null;
    this.editStatus = "idle";
    this.sound.play("move");
  }

  /** 사용자 보드에 풀이 가능한 큐를 자동 생성. Worker 사용 시 비동기 (UI 안 멈춤). */
  generateEditedPuzzle(): void {
    if (this.mode !== "editing") return;
    if (this.editStatus === "generating") return; // 이미 진행 중이면 무시

    // 빈 보드 거부 — 풀 게 없음
    const cellCount = this.countEditCells();
    if (cellCount === 0) {
      this.editFoundQueue = null;
      this.editStatus = "idle";
      this.flashToast("PLACE BLOCKS FIRST");
      this.sound.play("fail");
      return;
    }

    // 수학적 사전 검증: (cellCount + queue*4)가 10의 배수여야 함 (모든 셀이 라인 클리어로 사라질 수 있음)
    const total = cellCount + this.editQueueLength * 4;
    if (total % 10 !== 0) {
      const valid = this.computeFeasibleLengths();
      this.editFoundQueue = null;
      this.editStatus = "no-solution";
      if (valid.length === 0) {
        // cellCount가 홀수이거나 너무 큰 경우 — 어떤 q로도 안 됨 (1~10 범위)
        this.flashToast("ADD/REMOVE 1 CELL");
      } else if (valid.length === 1) {
        this.flashToast(`TRY Q=${valid[0]}`);
      } else {
        this.flashToast(`TRY Q=${valid.slice(0, 3).join("/")}`);
      }
      this.sound.play("fail");
      return;
    }

    this.editStatus = "generating";
    this.editFoundQueue = null;

    const worker = this.ensureWorker();
    if (worker) {
      const id = ++this.nextWorkerId;
      this.pendingWorkerId = id;
      worker.postMessage({
        id,
        grid: this.editGrid.map((row) => [...row]),
        length: this.editQueueLength,
      });
    } else {
      // Fallback: sync (테스트 환경 또는 Worker 미지원)
      const found = findSolvableQueue(this.editGrid, this.editQueueLength);
      this.applyGenerateResult(found ? { queue: found.queue, attempts: found.attempts } : null);
    }
  }

  /** Worker 생성 (lazy). 실패하거나 비활성화면 null. */
  private ensureWorker(): Worker | null {
    if (!this.useWorker) return null;
    if (this.solverWorker) return this.solverWorker;
    if (typeof Worker === "undefined") return null;
    try {
      this.solverWorker = new SolverWorker();
      this.solverWorker.addEventListener("message", (e: MessageEvent<WorkerResponseData>) => {
        this.onWorkerResponse(e.data);
      });
      this.solverWorker.addEventListener("error", () => {
        // Worker 오류 시 sync로 fallback
        this.solverWorker = null;
        if (this.editStatus === "generating") {
          const found = findSolvableQueue(this.editGrid, this.editQueueLength);
          this.applyGenerateResult(found ? { queue: found.queue, attempts: found.attempts } : null);
        }
      });
      return this.solverWorker;
    } catch {
      return null;
    }
  }

  private onWorkerResponse(data: WorkerResponseData): void {
    // 모드가 바뀌었거나 더 새 요청이 있으면 무시
    if (this.mode !== "editing") return;
    if (data.id !== this.pendingWorkerId) return;
    this.pendingWorkerId = null;
    this.applyGenerateResult(data.found);
  }

  private applyGenerateResult(found: GenerateResult | null): void {
    if (this.mode !== "editing") return;
    if (found) {
      this.editFoundQueue = found.queue;
      this.editStatus = "ready";
      this.flashToast(`SOLVABLE (${found.attempts} TRIES)`);
      this.sound.play("clear");
    } else {
      this.editFoundQueue = null;
      this.editStatus = "no-solution";
      this.flashToast("NO SOLUTION FOUND");
      this.sound.play("fail");
    }
  }

  /** 만든 퍼즐로 플레이 (planning 모드 진입) — URL도 갱신해서 즉시 공유 가능 */
  playEditedPuzzle(): void {
    if (this.mode !== "editing" || !this.editFoundQueue || this.editStatus !== "ready") return;
    const editedPuzzle: Puzzle = {
      seed: 0, // user-created (no seed)
      template: "near-line",
      difficulty: "Normal",
      grid: this.editGrid.map((row) => [...row]),
      queue: [...this.editFoundQueue],
      targetLines: 0,
      movesLimit: this.editFoundQueue.length,
    };
    // 현재 피드에 추가하고 그 인덱스로 이동 → planning 시작
    this.feed.splice(this.feedIndex + 1, 0, { puzzle: editedPuzzle, cleared: false });
    this.feedIndex += 1;
    this.feed = this.feed.slice(-12);
    this.feedIndex = Math.min(this.feedIndex, this.feed.length - 1);
    this.mode = "feed";
    this.editGrid = [];
    this.editFoundQueue = null;
    this.editStatus = "idle";
    this.grid = cloneGrid(this.activePuzzle.grid);

    // URL 갱신 — 사용자가 주소창 복사하거나 C 키 눌러 즉시 공유 가능
    if (typeof window !== "undefined" && window.history?.pushState) {
      const encoded = encodePuzzle(editedPuzzle.grid, editedPuzzle.queue);
      const newUrl = `${window.location.pathname}?p=${encoded}`;
      try {
        window.history.pushState({}, "", newUrl);
      } catch {
        // pushState 실패는 무시 (테스트 환경 등)
      }
    }

    this.startPlanning();
  }

  exitEditor(): void {
    if (this.mode !== "editing") return;
    this.mode = "feed";
    this.editGrid = [];
    this.editFoundQueue = null;
    this.editStatus = "idle";
  }

  // ──────────────────────────────

  toggleSound(): void {
    this.sound.setEnabled(!this.sound.isEnabled);
    setSoundOn(this.sound.isEnabled);
  }

  copyShareUrl(): void {
    const url = this.buildShareUrl();
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(
        () => this.flashToast("LINK COPIED"),
        () => this.flashToast("COPY FAILED"),
      );
    } else {
      this.flashToast("COPY UNAVAILABLE");
    }
  }

  /** 결과 공유 그리드 (Wordle 식) — 클립보드에 복사 */
  copyResultShare(): void {
    const text = this.buildResultShareText();
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => this.flashToast("RESULT COPIED"),
        () => this.flashToast("COPY FAILED"),
      );
    } else {
      this.flashToast("COPY UNAVAILABLE");
    }
  }

  private buildShareUrl(): string {
    const puzzle = this.activePuzzle;
    const base = `${window.location.origin}${window.location.pathname}`;
    if (puzzle.seed === 0) {
      // 사용자 만든 퍼즐 (인코딩)
      return `${base}?p=${encodePuzzle(puzzle.grid, puzzle.queue)}`;
    }
    // 데일리 시드 (YYYYMMDD 형식)이면 ?d=YYYY-MM-DD로
    const dailyStr = seedToDate(puzzle.seed);
    if (dailyStr) return `${base}?d=${dailyStr}`;
    return `${base}?seed=${puzzle.seed}`;
  }

  private buildResultShareText(): string {
    const puzzle = this.activePuzzle;
    const stars = this.attempts === 1 ? "★★★" : this.attempts === 2 ? "★★" : "★";
    const result = this.attempts === 1 ? "HOLE IN ONE" : `SOLVED IN ${this.attempts}`;
    const initialCells = puzzle.grid.flat().filter((c) => c !== null && c !== "wall").length;
    const queueLen = puzzle.queue.length;
    const lines = (initialCells + queueLen * 4) % 10 === 0 ? (initialCells + queueLen * 4) / 10 : 0;
    const missionStr = lines > 0
      ? `${queueLen} PIECES → ${lines === 4 ? "TETRIS! " : ""}${lines} LINES`
      : `${queueLen} PIECES`;
    const dailyStr = seedToDate(puzzle.seed);
    const title = dailyStr ? `Clear Feed Daily ${dailyStr}` : "Clear Feed";
    const url = this.buildShareUrl();
    return [title, `${stars} ${result}`, missionStr, "", url].join("\n");
  }

  setTouchTrail(points: Array<{ x: number; y: number }>): void {
    this.animation.touchTrail = points;
  }

  /** 컨트롤 버튼 누름 상태 (시각 피드백) */
  setPressedControl(action: string | null): void {
    this.pressedControl = action;
  }

  private flashToast(msg: string): void {
    this.animation.toast = msg;
    this.animation.toastAt = performance.now();
  }

  private appendPuzzle(): void {
    const seed = this.feed[this.feed.length - 1].puzzle.seed + 101 + this.feed.length * 7;
    const pooled = getPuzzlePool().pop();
    const puzzle = pooled ?? generateShufflePuzzle(seed) ?? createFeedPuzzle(seed, false);
    this.feed.push({ puzzle, cleared: false });
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

/** 시드가 YYYYMMDD 형식이면 'YYYY-MM-DD' 문자열로, 아니면 null */
function seedToDate(seed: number): string | null {
  if (seed < 19000101 || seed > 99991231) return null;
  const yyyy = Math.floor(seed / 10000);
  const mm = Math.floor((seed % 10000) / 100);
  const dd = seed % 100;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}
