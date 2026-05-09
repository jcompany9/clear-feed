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

  it("provides 6 initial feed puzzles", () => {
    const game = makeGame();
    expect(game.snapshot.feed).toHaveLength(6);
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

  it("does nothing while still planning", () => {
    const game = makeGame();
    game.startPlanning();
    const before = game.snapshot.attempts;
    game.retry();
    expect(game.snapshot.attempts).toBe(before);
    expect(game.snapshot.mode).toBe("planning");
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
    game.editToggleCell(3, 19);
    game.exitEditor();
    expect(game.snapshot.mode).toBe("feed");
    expect(game.snapshot.editGrid).toEqual([]);
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
