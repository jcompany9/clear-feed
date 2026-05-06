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

  it("movesLimit > targetLines (always solvable in principle)", () => {
    for (const seed of [1, 7, 42, 1024, 99999]) {
      const puzzle = createFeedPuzzle(seed);
      expect(puzzle.movesLimit).toBeGreaterThan(puzzle.targetLines);
    }
  });

  it("targetLines is in [1, 3]", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const puzzle = createFeedPuzzle(seed);
      expect(puzzle.targetLines).toBeGreaterThanOrEqual(1);
      expect(puzzle.targetLines).toBeLessThanOrEqual(3);
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
