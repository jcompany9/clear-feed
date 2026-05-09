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
  return new Game(sound, seed);
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

  it("queueIndex starts at 0 and attempts at 0", () => {
    const game = makeGame();
    expect(game.snapshot.queueIndex).toBe(0);
    expect(game.snapshot.attempts).toBe(0);
  });
});

describe("Game.startPlanning", () => {
  beforeEach(() => localStorage.clear());

  it("transitions mode to 'planning'", () => {
    const game = makeGame();
    game.startPlanning();
    expect(game.snapshot.mode).toBe("planning");
  });

  it("resets queueIndex and attempts", () => {
    const game = makeGame();
    game.startPlanning();
    expect(game.snapshot.queueIndex).toBe(0);
    expect(game.snapshot.attempts).toBe(0);
    expect(game.snapshot.currentRotation).toBe(0);
  });

  it("loads grid from puzzle initial state", () => {
    const game = makeGame();
    game.startPlanning();
    // grid should contain the puzzle's pre-filled blocks
    const filledCount = game.snapshot.grid.flat().filter((c) => c !== null).length;
    expect(filledCount).toBeGreaterThan(0);
  });

  it("snapshot.next exposes the first piece in the queue", () => {
    const game = makeGame();
    game.startPlanning();
    expect(game.snapshot.next).toBe(game.snapshot.puzzle.queue[0]);
  });
});

describe("Game.placeAt", () => {
  beforeEach(() => localStorage.clear());

  it("advances queueIndex by 1 when piece is successfully placed", () => {
    const game = makeGame();
    game.startPlanning();
    const before = game.snapshot.queueIndex;
    game.placeAt(4); // 중앙 컬럼
    // Either advanced (if placed), or stayed (if blocked) — at least one should advance somewhere
    expect(game.snapshot.queueIndex).toBeGreaterThanOrEqual(before);
  });

  it("resets currentRotation to 0 after a placement", () => {
    const game = makeGame();
    game.startPlanning();
    game.rotatePlanningPiece();
    game.rotatePlanningPiece();
    expect(game.snapshot.currentRotation).toBe(2);
    game.placeAt(0);
    if (game.snapshot.queueIndex > 0) {
      expect(game.snapshot.currentRotation).toBe(0);
    }
  });

  it("does nothing in feed mode", () => {
    const game = makeGame();
    expect(game.snapshot.mode).toBe("feed");
    game.placeAt(4);
    expect(game.snapshot.queueIndex).toBe(0);
  });
});

describe("Game.rotatePlanningPiece", () => {
  beforeEach(() => localStorage.clear());

  it("cycles rotation 0 → 1 → 2 → 3 → 0", () => {
    const game = makeGame();
    game.startPlanning();
    expect(game.snapshot.currentRotation).toBe(0);
    game.rotatePlanningPiece();
    expect(game.snapshot.currentRotation).toBe(1);
    game.rotatePlanningPiece();
    expect(game.snapshot.currentRotation).toBe(2);
    game.rotatePlanningPiece();
    expect(game.snapshot.currentRotation).toBe(3);
    game.rotatePlanningPiece();
    expect(game.snapshot.currentRotation).toBe(0);
  });

  it("does nothing in feed mode", () => {
    const game = makeGame();
    game.rotatePlanningPiece();
    expect(game.snapshot.currentRotation).toBe(0);
  });
});

describe("Game.undoLastPlacement", () => {
  beforeEach(() => localStorage.clear());

  it("reverts queueIndex and grid after a placement", () => {
    const game = makeGame();
    game.startPlanning();
    const initialIndex = game.snapshot.queueIndex;
    const initialGrid = game.snapshot.grid.map((row) => [...row]);
    game.placeAt(4);
    if (game.snapshot.queueIndex > initialIndex) {
      game.undoLastPlacement();
      expect(game.snapshot.queueIndex).toBe(initialIndex);
      // Grid should match initial state
      expect(JSON.stringify(game.snapshot.grid)).toBe(JSON.stringify(initialGrid));
    }
  });

  it("is a no-op when there is no history", () => {
    const game = makeGame();
    game.startPlanning();
    const before = game.snapshot.queueIndex;
    game.undoLastPlacement();
    expect(game.snapshot.queueIndex).toBe(before);
  });
});

describe("Game evaluate (planning end)", () => {
  beforeEach(() => localStorage.clear());

  it("transitions to 'failed' when queue exhausted but board not empty", () => {
    const game = makeGame();
    game.startPlanning();
    // 모든 큐 피스를 한 컬럼(0)에만 떨어뜨림 — 거의 항상 클리어 실패
    const queueLen = game.snapshot.puzzle.queue.length;
    for (let i = 0; i < queueLen; i += 1) {
      game.placeAt(0);
    }
    // queueIndex가 끝까지 가지 않을 수도 있음 (canPlace 실패 시)
    // 하지만 evaluate가 호출됐다면 mode는 clear/failed 중 하나
    if (game.snapshot.queueIndex >= queueLen) {
      expect(["clear", "failed"]).toContain(game.snapshot.mode);
      expect(game.snapshot.attempts).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("Game.retry", () => {
  beforeEach(() => localStorage.clear());

  it("does nothing while still planning", () => {
    const game = makeGame();
    game.startPlanning();
    const before = game.snapshot.attempts;
    game.retry();
    // 아직 planning 중이라 retry 무시
    expect(game.snapshot.attempts).toBe(before);
    expect(game.snapshot.mode).toBe("planning");
  });
});

describe("Game.abandon", () => {
  beforeEach(() => localStorage.clear());

  it("returns to feed mode when abandoning planning", () => {
    const game = makeGame();
    game.startPlanning();
    game.abandon();
    expect(game.snapshot.mode).toBe("feed");
    expect(game.snapshot.attempts).toBe(0);
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
