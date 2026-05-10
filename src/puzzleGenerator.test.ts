import { describe, it, expect } from "vitest";
import { COLS, ROWS, type Difficulty } from "./gameTypes";
import { createFeedPuzzle, createInitialFeed } from "./puzzleGenerator";

describe("createFeedPuzzle", () => {
  it("produces a Puzzle with structurally valid grid (20×10)", () => {
    const puzzle = createFeedPuzzle(1234);
    expect(puzzle.grid).toHaveLength(ROWS);
    for (const row of puzzle.grid) {
      expect(row).toHaveLength(COLS);
    }
  });

  it("queue length equals movesLimit", () => {
    for (const seed of [1, 7, 42, 1024, 99999]) {
      const puzzle = createFeedPuzzle(seed);
      expect(puzzle.queue).toHaveLength(puzzle.movesLimit);
    }
  });

  it("targetLines achievable by total cells (cells + 4*moves >= 10*targetLines)", () => {
    for (const seed of [1, 7, 42, 1024, 99999]) {
      const puzzle = createFeedPuzzle(seed);
      const cells = puzzle.grid.flat().filter((c) => c !== null && c !== "wall").length;
      const total = cells + puzzle.movesLimit * 4;
      expect(total).toBeGreaterThanOrEqual(puzzle.targetLines * 10);
    }
  });

  it("targetLines is in [1, 6] (line-mission identity)", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const puzzle = createFeedPuzzle(seed);
      expect(puzzle.targetLines).toBeGreaterThanOrEqual(1);
      expect(puzzle.targetLines).toBeLessThanOrEqual(6);
    }
  });

  it("challenge=true forces difficulty 'Challenge'", () => {
    const puzzle = createFeedPuzzle(1, true);
    expect(puzzle.difficulty).toBe<Difficulty>("Challenge");
  });

  it("seed and template fields are populated", () => {
    const puzzle = createFeedPuzzle(2026);
    expect(puzzle.seed).toBe(2026);
    expect(puzzle.template).toMatch(/^(near-line|center-slot|stairs|side-weight|repair)$/);
  });

  it("queue contains only valid PieceKind values", () => {
    const puzzle = createFeedPuzzle(123);
    const valid = ["I", "O", "T", "L", "J", "S", "Z"] as const;
    for (const kind of puzzle.queue) {
      expect(valid).toContain(kind);
    }
  });
});

describe("Classic mode (no Sandwich ceiling)", () => {
  it("does not contain wall cells anywhere in the grid", () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const puzzle = createFeedPuzzle(seed);
      for (let y = 0; y < ROWS; y += 1) {
        expect(puzzle.grid[y].some((cell) => cell === "wall")).toBe(false);
      }
    }
  });
});

describe("createInitialFeed", () => {
  it("returns the requested number of puzzles", () => {
    const feed = createInitialFeed(6, 1);
    expect(feed).toHaveLength(6);
    for (const puzzle of feed) {
      expect(puzzle.grid).toHaveLength(ROWS);
    }
  });

  it("uses different seeds for each puzzle (101 stride)", () => {
    const feed = createInitialFeed(4, 100);
    expect(feed.map((p) => p.seed)).toEqual([100, 201, 302, 403]);
  });
});
