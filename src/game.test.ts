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

function makeGame(): Game {
  const sound = new FakeSound() as unknown as SoundSystem;
  return new Game(sound);
}

describe("Game — initial state", () => {
  beforeEach(() => {
    localStorage.clear();
  });

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

  it("has no current piece in feed mode", () => {
    const game = makeGame();
    expect(game.snapshot.current).toBeNull();
  });
});

describe("Game.startPlaying", () => {
  beforeEach(() => localStorage.clear());

  it("transitions mode to 'playing' and spawns a piece", () => {
    const game = makeGame();
    game.startPlaying();
    expect(game.snapshot.mode).toBe("playing");
    expect(game.snapshot.current).not.toBeNull();
  });

  it("sets blocksLeft to puzzle.movesLimit", () => {
    const game = makeGame();
    game.startPlaying();
    expect(game.snapshot.blocksLeft).toBe(game.snapshot.puzzle.movesLimit);
  });

  it("resets linesCleared to 0", () => {
    const game = makeGame();
    game.startPlaying();
    expect(game.snapshot.linesCleared).toBe(0);
  });

  it("is idempotent (calling twice does not double-spawn)", () => {
    const game = makeGame();
    game.startPlaying();
    const firstPiece = game.snapshot.current;
    game.startPlaying();
    expect(game.snapshot.current).toBe(firstPiece);
  });
});

describe("Game.move", () => {
  beforeEach(() => localStorage.clear());

  it("shifts the current piece by ±1 when valid", () => {
    const game = makeGame();
    game.startPlaying();
    const startX = game.snapshot.current!.x;
    game.move(1);
    const after = game.snapshot.current!.x;
    // Either moved by +1, or blocked at wall (still at startX).
    expect([startX, startX + 1]).toContain(after);
  });

  it("does not move when not playing", () => {
    const game = makeGame();
    // mode is "feed", no current piece
    game.move(1);
    expect(game.snapshot.current).toBeNull();
  });
});

describe("Game.rotate", () => {
  beforeEach(() => localStorage.clear());

  it("changes piece cells (except O-piece)", () => {
    const game = makeGame();
    game.startPlaying();
    const piece = game.snapshot.current!;
    if (piece.kind === "O") return; // O is invariant under rotation; skip
    const before = piece.cells.map((c) => `${c.x},${c.y}`).join("|");
    game.rotate();
    const after = game.snapshot.current!.cells.map((c) => `${c.x},${c.y}`).join("|");
    expect(after).not.toBe(before);
  });
});

describe("Game.hardDrop", () => {
  beforeEach(() => localStorage.clear());

  it("locks the piece and either spawns next or ends the game", () => {
    const game = makeGame();
    game.startPlaying();
    const blocksBefore = game.snapshot.blocksLeft;
    game.hardDrop();
    // After hard drop, either blocks decreased, or game ended (mode != playing)
    if (game.snapshot.mode === "playing") {
      expect(game.snapshot.blocksLeft).toBe(blocksBefore - 1);
    } else {
      expect(["clear", "failed"]).toContain(game.snapshot.mode);
    }
  });
});

describe("Game.abandon", () => {
  beforeEach(() => localStorage.clear());

  it("transitions mode to 'failed' when playing", () => {
    const game = makeGame();
    game.startPlaying();
    game.abandon();
    expect(game.snapshot.mode).toBe("failed");
  });

  it("does nothing when not playing", () => {
    const game = makeGame();
    expect(game.snapshot.mode).toBe("feed");
    game.abandon();
    expect(game.snapshot.mode).toBe("feed");
  });
});

describe("Game.nextFeed", () => {
  beforeEach(() => localStorage.clear());

  it("advances feedIndex by +1 and triggers slide animation", () => {
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

  it("does nothing while playing", () => {
    const game = makeGame();
    game.startPlaying();
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
    const sound = new FakeSound() as unknown as SoundSystem;
    const game = new Game(sound, 99999);
    expect(game.snapshot.puzzle.seed).toBe(99999);
  });

  it("reproduces the same puzzle for the same initialSeed across instances", () => {
    const sound = new FakeSound() as unknown as SoundSystem;
    const a = new Game(sound, 12345);
    const b = new Game(sound, 12345);
    expect(a.snapshot.puzzle.seed).toBe(b.snapshot.puzzle.seed);
    expect(a.snapshot.puzzle.template).toBe(b.snapshot.puzzle.template);
    expect(a.snapshot.puzzle.movesLimit).toBe(b.snapshot.puzzle.movesLimit);
  });

  it("falls back to storage-derived seed when no initialSeed given", () => {
    const sound = new FakeSound() as unknown as SoundSystem;
    const game = new Game(sound);
    // Default fallback: lastSeed (Date.now() % 100000) + 17
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
