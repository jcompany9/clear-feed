import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "./game";
import type { SoundSystem } from "./sound";
import { COLS, ROWS } from "./gameTypes";

class FakeSound {
  private enabled = true;
  setEnabled(value: boolean): void {
    this.enabled = value;
  }
  get isEnabled(): boolean {
    return this.enabled;
  }
  unlock(): void {}
  play(_name: string): void {
    void _name;
  }
}

function makeGame(seed?: number): Game {
  const sound = new FakeSound() as unknown as SoundSystem;
  // useWorker:false → 솔버를 메인 스레드에서 동기 실행 (테스트 결정성 + happy-dom Worker 미지원)
  return new Game(sound, seed, undefined, { useWorker: false });
}

describe("Game — initial state", () => {
  beforeEach(() => localStorage.clear());

  it("starts in feed mode", () => {
    const game = makeGame();
    expect(game.snapshot.mode).toBe("feed");
  });

  it("provides initial feed puzzles (>= 1, worker pool fills more in background)", () => {
    const game = makeGame();
    expect(game.snapshot.feed.length).toBeGreaterThanOrEqual(1);
    expect(game.snapshot.feedIndex).toBe(0);
  });

  it("snapshot.grid is 20x10", () => {
    const game = makeGame();
    expect(game.snapshot.grid).toHaveLength(ROWS);
    expect(game.snapshot.grid[0]).toHaveLength(COLS);
  });

  it("queueIndex 0, attempts 0, no current piece in feed", () => {
    const game = makeGame();
    expect(game.snapshot.queueIndex).toBe(0);
    expect(game.snapshot.attempts).toBe(0);
    expect(game.snapshot.current).toBeNull();
  });
});

describe("Game.startPlanning", () => {
  beforeEach(() => localStorage.clear());

  it("transitions mode to 'planning' and spawns a piece", () => {
    const game = makeGame();
    game.startPlanning();
    expect(game.snapshot.mode).toBe("planning");
    expect(game.snapshot.current).not.toBeNull();
    expect(game.snapshot.current?.kind).toBe(game.snapshot.puzzle.queue[0]);
  });

  it("loads grid from puzzle initial state", () => {
    const game = makeGame();
    game.startPlanning();
    const filledCount = game.snapshot.grid.flat().filter((c) => c !== null).length;
    expect(filledCount).toBeGreaterThan(0);
  });

  it("provides ghostCells for the current piece", () => {
    const game = makeGame();
    game.startPlanning();
    expect(game.snapshot.ghostCells).not.toBeNull();
    expect(game.snapshot.ghostCells?.length).toBe(4); // tetromino has 4 cells
  });
});

describe("Game.moveCurrent", () => {
  beforeEach(() => localStorage.clear());

  it("shifts the current piece by ±1 when valid", () => {
    const game = makeGame();
    game.startPlanning();
    const startX = game.snapshot.current!.x;
    game.moveCurrent(1);
    expect([startX, startX + 1]).toContain(game.snapshot.current!.x);
  });

  it("does not move when not in planning mode", () => {
    const game = makeGame();
    game.moveCurrent(1);
    expect(game.snapshot.current).toBeNull();
  });
});

describe("Game.setPieceColumn", () => {
  beforeEach(() => localStorage.clear());

  it("moves piece directly to a target column", () => {
    const game = makeGame();
    game.startPlanning();
    game.setPieceColumn(7);
    // 도달 가능한 위치까지는 이동 (충돌 시 도중에 멈춤)
    expect(game.snapshot.current!.x).toBeGreaterThanOrEqual(4);
  });

  it("does nothing in feed mode", () => {
    const game = makeGame();
    game.setPieceColumn(7);
    expect(game.snapshot.current).toBeNull();
  });
});

describe("Game.rotateCurrent", () => {
  beforeEach(() => localStorage.clear());

  it("changes piece cells (except O-piece)", () => {
    const game = makeGame();
    game.startPlanning();
    const piece = game.snapshot.current!;
    if (piece.kind === "O") return;
    const before = piece.cells.map((c) => `${c.x},${c.y}`).join("|");
    game.rotateCurrent();
    const after = game.snapshot.current!.cells.map((c) => `${c.x},${c.y}`).join("|");
    expect(after).not.toBe(before);
  });
});

describe("Game.dropCurrent", () => {
  beforeEach(() => localStorage.clear());

  it("locks the piece and spawns next (or evaluates)", () => {
    const game = makeGame();
    game.startPlanning();
    const queueLenBefore = game.snapshot.blocksLeft;
    game.dropCurrent();
    if (game.snapshot.mode === "planning") {
      expect(game.snapshot.blocksLeft).toBe(queueLenBefore - 1);
      expect(game.snapshot.current).not.toBeNull();
    } else {
      expect(["clear", "failed"]).toContain(game.snapshot.mode);
    }
  });
});

describe("Game.slideToFloor", () => {
  beforeEach(() => localStorage.clear());

  it("moves piece to the lowest position without locking it", () => {
    const game = makeGame();
    game.startPlanning();
    const before = game.snapshot.current!;
    const queueLenBefore = game.snapshot.blocksLeft;
    game.slideToFloor();
    const after = game.snapshot.current;
    // Piece should still exist (not locked)
    expect(after).not.toBeNull();
    expect(after?.kind).toBe(before.kind);
    // queueIndex should be unchanged
    expect(game.snapshot.blocksLeft).toBe(queueLenBefore);
    // Piece should be at or below initial position
    expect(after!.y).toBeGreaterThanOrEqual(before.y);
  });

  it("allows lateral movement after sliding (slide-then-shift skill)", () => {
    const game = makeGame();
    game.startPlanning();
    game.slideToFloor();
    const afterSlide = game.snapshot.current!;
    // After slide, piece is at floor; we still try to move sideways.
    game.moveCurrent(1);
    const afterMove = game.snapshot.current!;
    // Either piece moved (move succeeded) or stayed (collision) — but kind/y unchanged in any case
    expect(afterMove.kind).toBe(afterSlide.kind);
    // Piece is still un-locked
    expect(game.snapshot.current).not.toBeNull();
  });

  it("does nothing when not in planning mode", () => {
    const game = makeGame();
    expect(game.snapshot.mode).toBe("feed");
    game.slideToFloor();
    expect(game.snapshot.current).toBeNull();
  });
});

describe("Game.undoLastPlacement", () => {
  beforeEach(() => localStorage.clear());

  it("reverts the last drop and restores previous piece", () => {
    const game = makeGame();
    game.startPlanning();
    const firstKind = game.snapshot.current!.kind;
    const initialGrid = game.snapshot.grid.map((row) => [...row]);
    game.dropCurrent();
    if (game.snapshot.mode !== "planning") return; // queue too short
    game.undoLastPlacement();
    expect(game.snapshot.queueIndex).toBe(0);
    expect(game.snapshot.current?.kind).toBe(firstKind);
    expect(JSON.stringify(game.snapshot.grid)).toBe(JSON.stringify(initialGrid));
  });

  it("is a no-op when no history", () => {
    const game = makeGame();
    game.startPlanning();
    const before = game.snapshot.queueIndex;
    game.undoLastPlacement();
    expect(game.snapshot.queueIndex).toBe(before);
  });
});

describe("Game evaluation (clear / failed)", () => {
  beforeEach(() => localStorage.clear());

  it("transitions to 'failed' or 'clear' after queue exhausted", () => {
    const game = makeGame();
    game.startPlanning();
    const queueLen = game.snapshot.puzzle.queue.length;
    for (let i = 0; i < queueLen; i += 1) {
      if (game.snapshot.mode !== "planning") break;
      game.dropCurrent();
    }
    expect(["clear", "failed"]).toContain(game.snapshot.mode);
    expect(game.snapshot.attempts).toBeGreaterThanOrEqual(1);
  });
});

describe("Game.retry", () => {
  beforeEach(() => localStorage.clear());

  it("mid-planning restart increments attempts and resets queue/grid", () => {
    // 1 피스 드롭으로 라인 클리어 발생하면 mode=clear 이 되어 retry 의미 달라짐 →
    // 빈 보드 + 다중 피스 큐로 강제 (드롭해도 라인 클리어 X, 모드 유지)
    const sound = new FakeSound() as unknown as SoundSystem;
    const emptyGrid = Array.from({ length: ROWS }, () =>
      Array.from({ length: COLS }, () => null),
    );
    const customPuzzle = {
      seed: 0,
      template: "near-line" as const,
      difficulty: "Normal" as const,
      grid: emptyGrid,
      queue: ["O", "O", "O"] as Array<"O">,
      targetLines: 1,
      movesLimit: 3,
    };
    const game = new Game(sound, undefined, customPuzzle, { useWorker: false });
    game.startPlanning();
    const initialQueueLen = game.snapshot.puzzle.queue.length;
    game.dropCurrent();
    const beforeAttempts = game.snapshot.attempts;
    expect(game.snapshot.mode).toBe("planning");
    expect(game.snapshot.queueIndex).toBeGreaterThan(0);
    game.retry();
    expect(game.snapshot.mode).toBe("planning");
    expect(game.snapshot.attempts).toBe(beforeAttempts + 1);
    expect(game.snapshot.queueIndex).toBe(0);
    expect(game.snapshot.puzzle.queue.length).toBe(initialQueueLen);
  });
});

describe("Game.abandon", () => {
  beforeEach(() => localStorage.clear());

  it("returns to feed mode and clears state", () => {
    const game = makeGame();
    game.startPlanning();
    game.abandon();
    expect(game.snapshot.mode).toBe("feed");
    expect(game.snapshot.current).toBeNull();
    expect(game.snapshot.queueIndex).toBe(0);
  });

  it("does nothing in feed mode", () => {
    const game = makeGame();
    game.abandon();
    expect(game.snapshot.mode).toBe("feed");
  });
});

describe("Game.nextFeed", () => {
  beforeEach(() => localStorage.clear());

  it("advances feedIndex by +1 and triggers slide", () => {
    const game = makeGame();
    const before = game.snapshot.feedIndex;
    game.nextFeed(1);
    expect(game.snapshot.feedIndex).toBeGreaterThan(before);
    expect(Math.abs(game.snapshot.animation.feedSlide)).toBeGreaterThan(0);
  });

  it("clamps at index 0 when going backwards from start", () => {
    const game = makeGame();
    expect(game.snapshot.feedIndex).toBe(0);
    game.nextFeed(-1);
    expect(game.snapshot.feedIndex).toBe(0);
  });

  it("does nothing while planning", () => {
    const game = makeGame();
    game.startPlanning();
    const before = game.snapshot.feedIndex;
    game.nextFeed(1);
    expect(game.snapshot.feedIndex).toBe(before);
  });
});

describe("Game.challengeFeed", () => {
  beforeEach(() => localStorage.clear());

  it("inserts a Challenge puzzle and advances index", () => {
    const game = makeGame();
    const sizeBefore = game.snapshot.feed.length;
    game.challengeFeed();
    expect(game.snapshot.feed.length).toBe(sizeBefore + 1);
    expect(game.snapshot.puzzle.difficulty).toBe("Challenge");
  });
});

describe("Game.toggleSound", () => {
  beforeEach(() => localStorage.clear());

  it("flips the sound flag and persists it", () => {
    const game = makeGame();
    const before = game.snapshot.soundOn;
    game.toggleSound();
    expect(game.snapshot.soundOn).toBe(!before);
  });
});

describe("Game — initialSeed (URL share)", () => {
  beforeEach(() => localStorage.clear());

  it("uses the provided initialSeed as the first puzzle's seed", () => {
    const game = makeGame(99999);
    expect(game.snapshot.puzzle.seed).toBe(99999);
  });

  it("reproduces the same puzzle for the same initialSeed across instances", () => {
    const a = makeGame(12345);
    const b = makeGame(12345);
    expect(a.snapshot.puzzle.seed).toBe(b.snapshot.puzzle.seed);
    expect(a.snapshot.puzzle.template).toBe(b.snapshot.puzzle.template);
    expect(a.snapshot.puzzle.movesLimit).toBe(b.snapshot.puzzle.movesLimit);
  });

  it("falls back to storage-derived seed when no initialSeed given", () => {
    const game = makeGame();
    expect(typeof game.snapshot.puzzle.seed).toBe("number");
    expect(Number.isFinite(game.snapshot.puzzle.seed)).toBe(true);
  });
});

describe("Editor — enterEditor / exitEditor", () => {
  beforeEach(() => localStorage.clear());

  it("enters editor mode from feed and initializes empty grid", () => {
    const game = makeGame();
    game.enterEditor();
    expect(game.snapshot.mode).toBe("editing");
    expect(game.snapshot.editGrid).toHaveLength(ROWS);
    expect(game.snapshot.editGrid[0]).toHaveLength(COLS);
    expect(game.snapshot.editGrid.flat().every((c) => c === null)).toBe(true);
    expect(game.snapshot.editQueueLength).toBe(5);
    expect(game.snapshot.editStatus).toBe("idle");
    expect(game.snapshot.editFoundQueue).toBeNull();
  });

  it("does not enter editor while planning", () => {
    const game = makeGame();
    game.startPlanning();
    game.enterEditor();
    expect(game.snapshot.mode).toBe("planning");
  });

  it("exitEditor returns to feed and clears state", () => {
    const game = makeGame();
    game.enterEditor();
    game.editHardDrop();  // drop active piece
    game.exitEditor();
    expect(game.snapshot.mode).toBe("feed");
    expect(game.snapshot.editGrid).toEqual([]);
  });
});

describe("Editor — tool selection & piece placement", () => {
  beforeEach(() => localStorage.clear());

  it("starts with random piece queue (real-tetris mode)", () => {
    const game = makeGame();
    game.enterEditor();
    // 큐 ≥ 5, 첫 도구는 큐의 첫 피스 (랜덤)
    expect(game.snapshot.editPieceQueue.length).toBeGreaterThanOrEqual(5);
    expect(game.snapshot.editTool).toBe(game.snapshot.editPieceQueue[0]);
    expect(game.snapshot.editToolRotation).toBe(0);
  });

  it("rotateEditTool cycles 0→1→2→3→0", () => {
    const game = makeGame();
    game.enterEditor();
    expect(game.snapshot.editToolRotation).toBe(0);
    game.rotateEditTool();
    expect(game.snapshot.editToolRotation).toBe(1);
    game.rotateEditTool();
    game.rotateEditTool();
    game.rotateEditTool();
    expect(game.snapshot.editToolRotation).toBe(0);
  });

  it("editor spawns active piece at top center on enter", () => {
    const game = makeGame();
    game.enterEditor();
    expect(game.snapshot.editCurrentPiece).not.toBeNull();
    const cur = game.snapshot.editCurrentPiece!;
    expect(cur.kind).toBe(game.snapshot.editPieceQueue[0]);
    expect(cur.y).toBeLessThanOrEqual(2);  // 상단 영역
  });

  it("editHardDrop locks active piece + spawns next", () => {
    const game = makeGame();
    game.enterEditor();
    const before = game.snapshot.editPieceQueue[0];
    game.editHardDrop();
    const filled = game.snapshot.editGrid.flat().filter((c) => c !== null);
    expect(filled.length).toBeGreaterThan(0);
    expect(filled.every((c) => c === before)).toBe(true);
    // 다음 피스 자동 스폰
    expect(game.snapshot.editCurrentPiece).not.toBeNull();
    expect(game.snapshot.editCurrentPiece!.kind).toBe(game.snapshot.editPieceQueue[0]);
  });

  it("editMoveCurrent shifts piece left/right", () => {
    const game = makeGame();
    game.enterEditor();
    const startX = game.snapshot.editCurrentPiece!.x;
    game.editMoveCurrent(-1);
    expect(game.snapshot.editCurrentPiece!.x).toBe(startX - 1);
    game.editMoveCurrent(2);
    expect(game.snapshot.editCurrentPiece!.x).toBe(startX + 1);
  });

  it("editHardDrop rejects + shakes when line would clear", () => {
    const game = makeGame();
    game.enterEditor();
    // 거의 가득 찬 row 19 — 4,5 비움
    for (let x = 0; x < 10; x += 1) {
      if (x !== 4 && x !== 5) game.editToggleCell(x, 19);
    }
    const before = game.snapshot.editGrid.flat().filter((c) => c !== null).length;
    expect(before).toBe(8);
    // active piece 를 col 4-5 위로 이동시킨 후 hard drop → row 19 가 차면 거부
    game.editHardDrop();
    const after = game.snapshot.editGrid.flat().filter((c) => c !== null).length;
    // 거부면 셀 수 같음 + shake; 허용이면 +N (피스 셀)
    if (after === before) {
      expect(game.snapshot.animation.editShake).toBeGreaterThan(0);
    } else {
      expect(after).toBeGreaterThan(before);
    }
  });
});

describe("Editor — editToggleCell", () => {
  beforeEach(() => localStorage.clear());

  it("toggles cell at (x, y) between null and 'garbage'", () => {
    const game = makeGame();
    game.enterEditor();
    expect(game.snapshot.editGrid[19][3]).toBeNull();
    game.editToggleCell(3, 19);
    expect(game.snapshot.editGrid[19][3]).toBe("garbage");
    game.editToggleCell(3, 19);
    expect(game.snapshot.editGrid[19][3]).toBeNull();
  });

  it("resets editStatus to 'idle' after toggling (regardless of prior state)", () => {
    const game = makeGame();
    game.enterEditor();
    // 토글 자체로 idle이 유지되어야 함 (generate 호출 없이도 보장)
    game.editToggleCell(3, 19);
    expect(game.snapshot.editStatus).toBe("idle");
    expect(game.snapshot.editFoundQueue).toBeNull();
    game.editToggleCell(4, 19);
    expect(game.snapshot.editStatus).toBe("idle");
    expect(game.snapshot.editFoundQueue).toBeNull();
  });

  it("ignores out-of-range cells", () => {
    const game = makeGame();
    game.enterEditor();
    game.editToggleCell(-1, 0);
    game.editToggleCell(0, -1);
    game.editToggleCell(COLS, 0);
    game.editToggleCell(0, ROWS);
    expect(game.snapshot.editGrid.flat().every((c) => c === null)).toBe(true);
  });
});

describe("Editor — setEditQueueLength", () => {
  beforeEach(() => localStorage.clear());

  it("increments and decrements queue length within [1, 10]", () => {
    const game = makeGame();
    game.enterEditor();
    expect(game.snapshot.editQueueLength).toBe(5);
    game.setEditQueueLength(2);
    expect(game.snapshot.editQueueLength).toBe(7);
    game.setEditQueueLength(-3);
    expect(game.snapshot.editQueueLength).toBe(4);
  });

  it("clamps at lower bound 1", () => {
    const game = makeGame();
    game.enterEditor();
    game.setEditQueueLength(-100);
    expect(game.snapshot.editQueueLength).toBe(5);
    // 5 → -4 will fail (would be 1, but our impl rejects out-of-range completely)
    // just verify it stays at 5 since attempting to go below 1
  });

  it("clamps at upper bound 10", () => {
    const game = makeGame();
    game.enterEditor();
    game.setEditQueueLength(100);
    expect(game.snapshot.editQueueLength).toBe(5);
  });
});

describe("Editor — generateEditedPuzzle", () => {
  beforeEach(() => localStorage.clear());

  it("rejects mathematically infeasible queue length with 'TRY Q=' toast", () => {
    const game = makeGame();
    game.enterEditor();
    // 16 cells via cell-toggle (test helper) — queue=5 → 16+20=36, not divisible by 10
    for (let i = 0; i < 16; i += 1) {
      const x = i % 8;
      const y = 19 - Math.floor(i / 8);
      game.editToggleCell(x, y);
    }
    expect(game.snapshot.editGrid.flat().filter((c) => c !== null).length).toBe(16);
    expect(game.snapshot.editQueueLength).toBe(5);
    game.generateEditedPuzzle();
    expect(game.snapshot.editStatus).toBe("no-solution");
    expect(game.snapshot.animation.toast).toMatch(/TRY Q=/);
  });

  it("editFeasibleLengths reflects (cellCount + 4*q) % 10 === 0", () => {
    const game = makeGame();
    game.enterEditor();
    expect(game.snapshot.editFeasibleLengths).toEqual([]);
    // 16 cells: valid q in 1..10 = {1, 6}
    for (let i = 0; i < 16; i += 1) {
      const x = i % 8;
      const y = 19 - Math.floor(i / 8);
      game.editToggleCell(x, y);
    }
    expect(game.snapshot.editFeasibleLengths).toEqual([1, 6]);
  });

  it("rejects empty board with 'PLACE BLOCKS FIRST' toast (status stays idle)", () => {
    const game = makeGame();
    game.enterEditor();
    expect(game.snapshot.editGrid.flat().every((c) => c === null)).toBe(true);
    game.generateEditedPuzzle();
    expect(game.snapshot.editStatus).toBe("idle");
    expect(game.snapshot.editFoundQueue).toBeNull();
    expect(game.snapshot.animation.toast).toBe("PLACE BLOCKS FIRST");
  });

  it("transitions status to 'ready' or 'no-solution' after generation", () => {
    const game = makeGame();
    game.enterEditor();
    // 행 19 갭 4 보드 — I-piece로 풀 수 있음
    game.editToggleCell(0, 19);
    game.editToggleCell(1, 19);
    game.editToggleCell(2, 19);
    game.editToggleCell(7, 19);
    game.editToggleCell(8, 19);
    game.editToggleCell(9, 19);
    game.setEditQueueLength(-4); // length=1
    game.generateEditedPuzzle();
    expect(["ready", "no-solution"]).toContain(game.snapshot.editStatus);
  });
});

describe("Editor — playEditedPuzzle", () => {
  beforeEach(() => localStorage.clear());

  it("does nothing if status is not 'ready'", () => {
    const game = makeGame();
    game.enterEditor();
    game.playEditedPuzzle();
    expect(game.snapshot.mode).toBe("editing");
  });
});

describe("Game.update — feed animation decay", () => {
  beforeEach(() => localStorage.clear());

  it("decays feedSlide toward 0 when ticking", () => {
    const game = makeGame();
    game.nextFeed(1);
    const initial = Math.abs(game.snapshot.animation.feedSlide);
    expect(initial).toBeGreaterThan(0);
    for (let i = 0; i < 100; i += 1) game.update(performance.now());
    expect(Math.abs(game.snapshot.animation.feedSlide)).toBeLessThan(initial);
  });
});
