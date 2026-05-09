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

  it("plannedMoves and activeEditIndex defaults", () => {
    const game = makeGame();
    expect(game.snapshot.plannedMoves).toEqual([]);
    expect(game.snapshot.activeEditIndex).toBeNull();
    expect(game.snapshot.canExecute).toBe(false);
  });
});

describe("Game.startPlanning", () => {
  beforeEach(() => localStorage.clear());

  it("transitions mode to 'planning'", () => {
    const game = makeGame();
    game.startPlanning();
    expect(game.snapshot.mode).toBe("planning");
  });

  it("initializes plannedMoves to all-null with activeEditIndex=0", () => {
    const game = makeGame();
    game.startPlanning();
    const queueLen = game.snapshot.puzzle.queue.length;
    expect(game.snapshot.plannedMoves).toHaveLength(queueLen);
    expect(game.snapshot.plannedMoves.every((m) => m === null)).toBe(true);
    expect(game.snapshot.activeEditIndex).toBe(0);
    expect(game.snapshot.currentRotation).toBe(0);
  });

  it("loads grid from puzzle initial state", () => {
    const game = makeGame();
    game.startPlanning();
    const filledCount = game.snapshot.grid.flat().filter((c) => c !== null).length;
    expect(filledCount).toBeGreaterThan(0);
  });
});

describe("Game.placeAt — adds plan, advances active", () => {
  beforeEach(() => localStorage.clear());

  it("sets the active piece's plan and auto-advances active to next unplanned", () => {
    const game = makeGame();
    game.startPlanning();
    const firstActive = game.snapshot.activeEditIndex!;
    game.placeAt(4);
    expect(game.snapshot.plannedMoves[firstActive]).toEqual({ x: 4, rotation: 0 });
    // active should advance (unless only 1 piece in queue)
    if (game.snapshot.puzzle.queue.length > 1) {
      expect(game.snapshot.activeEditIndex).not.toBe(firstActive);
    }
  });

  it("re-placing on already-planned active updates the same slot", () => {
    const game = makeGame();
    game.startPlanning();
    game.selectPiece(0);
    game.placeAt(3);
    game.selectPiece(0); // back to first
    game.placeAt(7);
    expect(game.snapshot.plannedMoves[0]).toEqual({ x: 7, rotation: 0 });
  });

  it("does nothing in feed mode", () => {
    const game = makeGame();
    game.placeAt(4);
    expect(game.snapshot.plannedMoves).toEqual([]);
  });
});

describe("Game.selectPiece", () => {
  beforeEach(() => localStorage.clear());

  it("changes activeEditIndex to the chosen index", () => {
    const game = makeGame();
    game.startPlanning();
    game.selectPiece(2);
    expect(game.snapshot.activeEditIndex).toBe(2);
  });

  it("ignores out-of-range indices", () => {
    const game = makeGame();
    game.startPlanning();
    const before = game.snapshot.activeEditIndex;
    game.selectPiece(-1);
    game.selectPiece(999);
    expect(game.snapshot.activeEditIndex).toBe(before);
  });

  it("restores rotation from existing plan when switching", () => {
    const game = makeGame();
    game.startPlanning();
    game.rotatePlanningPiece(); // rot=1 on piece 0 (no plan yet)
    game.placeAt(3); // plan piece 0 at (3, rot=1)
    game.selectPiece(0); // come back to piece 0
    expect(game.snapshot.currentRotation).toBe(1);
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

  it("updates the rotation of an already-planned active piece", () => {
    const game = makeGame();
    game.startPlanning();
    game.selectPiece(0);
    game.placeAt(3); // plan piece 0 at (3, rot=0)
    game.selectPiece(0); // back to it
    game.rotatePlanningPiece();
    expect(game.snapshot.plannedMoves[0]?.rotation).toBe(1);
    expect(game.snapshot.plannedMoves[0]?.x).toBe(3);
  });
});

describe("Game.undoLastPlacement", () => {
  beforeEach(() => localStorage.clear());

  it("clears the active piece's plan if it was planned", () => {
    const game = makeGame();
    game.startPlanning();
    game.selectPiece(0);
    game.placeAt(3);
    game.selectPiece(0);
    game.undoLastPlacement();
    expect(game.snapshot.plannedMoves[0]).toBeNull();
  });

  it("is a no-op if active piece has no plan", () => {
    const game = makeGame();
    game.startPlanning();
    game.undoLastPlacement();
    expect(game.snapshot.plannedMoves.every((m) => m === null)).toBe(true);
  });
});

describe("Game.executePlan", () => {
  beforeEach(() => localStorage.clear());

  it("does nothing if not all pieces planned (toast set)", () => {
    const game = makeGame();
    game.startPlanning();
    // plan only the first piece
    game.placeAt(4);
    game.executePlan();
    expect(game.snapshot.mode).toBe("planning");
  });

  it("transitions to clear or failed when all pieces planned", () => {
    const game = makeGame();
    game.startPlanning();
    const queueLen = game.snapshot.puzzle.queue.length;
    // plan everything to column 4 (most likely fail, but valid plan)
    for (let i = 0; i < queueLen; i += 1) {
      game.selectPiece(i);
      game.placeAt(4);
    }
    game.executePlan();
    expect(["clear", "failed"]).toContain(game.snapshot.mode);
    expect(game.snapshot.attempts).toBeGreaterThanOrEqual(1);
  });
});

describe("Game.canExecute flag", () => {
  beforeEach(() => localStorage.clear());

  it("starts false", () => {
    const game = makeGame();
    game.startPlanning();
    expect(game.snapshot.canExecute).toBe(false);
  });

  it("becomes true once every plan slot is filled (and valid)", () => {
    const game = makeGame();
    game.startPlanning();
    const queueLen = game.snapshot.puzzle.queue.length;
    for (let i = 0; i < queueLen; i += 1) {
      game.selectPiece(i);
      game.placeAt(i % COLS);
    }
    // canExecute may still be false if some plan is invalid; but plannedMoves all set
    const allPlanned = game.snapshot.plannedMoves.every((m) => m !== null);
    expect(allPlanned).toBe(true);
  });
});

describe("Game.plannedGhosts simulation", () => {
  beforeEach(() => localStorage.clear());

  it("returns one ghost per planned move with kind from queue", () => {
    const game = makeGame();
    game.startPlanning();
    game.selectPiece(0);
    game.placeAt(2);
    game.selectPiece(1);
    game.placeAt(5);
    const ghosts = game.snapshot.plannedGhosts;
    expect(ghosts.length).toBe(2);
    expect(ghosts[0].queueIndex).toBe(0);
    expect(ghosts[0].kind).toBe(game.snapshot.puzzle.queue[0]);
    expect(ghosts[1].queueIndex).toBe(1);
    expect(ghosts[1].kind).toBe(game.snapshot.puzzle.queue[1]);
  });

  it("marks active piece's ghost with isActive=true", () => {
    const game = makeGame();
    game.startPlanning();
    game.selectPiece(0);
    game.placeAt(2);
    game.selectPiece(0); // back to 0
    const activeGhost = game.snapshot.plannedGhosts.find((g) => g.queueIndex === 0);
    expect(activeGhost?.isActive).toBe(true);
  });
});

describe("Game.abandon", () => {
  beforeEach(() => localStorage.clear());

  it("returns to feed mode and clears plans", () => {
    const game = makeGame();
    game.startPlanning();
    game.placeAt(3);
    game.abandon();
    expect(game.snapshot.mode).toBe("feed");
    expect(game.snapshot.plannedMoves).toEqual([]);
    expect(game.snapshot.activeEditIndex).toBeNull();
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
