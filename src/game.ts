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
  private editGrid: Cell[][] = [];
  private editQueueLength = 5;
  private editFoundQueue: PieceKind[] | null = null;
  private editStatus: "idle" | "generating" | "ready" | "no-solution" = "idle";
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
      const more = createInitialFeed(5, seedBase).map((puzzle) => ({ puzzle, cleared: false }));
      this.feed = [{ puzzle: initialPuzzle, cleared: false }, ...more];
    } else {
      this.feed = createInitialFeed(6, seedBase).map((puzzle) => ({ puzzle, cleared: false }));
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
      linesCleared: 0,
      feed: this.feed,
      feedIndex: this.feedIndex,
      soundOn: this.sound.isEnabled,
      animation: this.animation,
      attempts: this.attempts,
      queueIndex: this.queueIndex,
      ghostCells: this.computeGhost(),
      editGrid: this.editGrid.map((row) => [...row]),
      editQueueLength: this.editQueueLength,
      editFoundQueue: this.editFoundQueue ? [...this.editFoundQueue] : null,
      editStatus: this.editStatus,
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
    let piece = createPiece(this.editTool);
    for (let i = 0; i < this.editToolRotation; i += 1) piece = rotatePiece(piece);
    piece = { ...piece, x: col, y: row };
    const cells = absoluteCells(piece);
    const inBounds = cells.every((c) => c.x >= 0 && c.x < COLS && c.y >= 0 && c.y < ROWS);
    const free = inBounds && cells.every((c) => this.editGrid[c.y][c.x] === null);
    return { cells, kind: this.editTool, valid: inBounds && free };
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

  // ──────── Editor (UGC) ────────

  enterEditor(): void {
    if (this.mode !== "feed") return;
    this.mode = "editing";
    this.editGrid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null as Cell));
    this.editQueueLength = 5;
    this.editFoundQueue = null;
    this.editStatus = "idle";
    this.editTool = "cell";
    this.editToolRotation = 0;
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

  /** 현재 선택된 도구로 (col, row)에 작용. 도구가 셀이면 토글, 피스면 4셀 배치. */
  editPlaceAt(col: number, row: number): void {
    if (this.mode !== "editing") return;
    if (this.editTool === "cell") {
      this.editToggleCell(col, row);
      return;
    }
    // 피스 배치: 회전 적용 후, (col, row)를 piece의 (x, y)로 사용
    let piece = createPiece(this.editTool);
    for (let i = 0; i < this.editToolRotation; i += 1) piece = rotatePiece(piece);
    piece = { ...piece, x: col, y: row };
    const cells = absoluteCells(piece);
    // 모든 셀이 보드 안 + 비어있어야 배치 가능
    const outOfBounds = cells.some((c) => c.x < 0 || c.x >= COLS || c.y < 0 || c.y >= ROWS);
    if (outOfBounds) {
      this.flashToast("OUT OF BOUNDS");
      return;
    }
    const blocked = cells.some((c) => this.editGrid[c.y][c.x] !== null);
    if (blocked) {
      this.flashToast("BLOCKED");
      return;
    }
    for (const cell of cells) {
      this.editGrid[cell.y][cell.x] = this.editTool;
    }
    this.editFoundQueue = null;
    this.editStatus = "idle";
    this.sound.play("land");
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
    const puzzle = this.activePuzzle;
    const base = `${window.location.origin}${window.location.pathname}`;
    // seed === 0 = 사용자 만든 퍼즐 (인코딩) / 그 외 = 시드 (짧은 URL)
    const url =
      puzzle.seed === 0
        ? `${base}?p=${encodePuzzle(puzzle.grid, puzzle.queue)}`
        : `${base}?seed=${puzzle.seed}`;
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
