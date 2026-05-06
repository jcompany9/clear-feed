import { describe, it, expect, beforeEach } from "vitest";
import { loadStorage, rememberPuzzle, setSoundOn } from "./storage";
import type { Puzzle } from "./gameTypes";

const STORAGE_KEY = "clear-feed-mvp";

function makePuzzle(seed: number, overrides: Partial<Puzzle> = {}): Puzzle {
  return {
    seed,
    template: "near-line",
    difficulty: "Easy",
    grid: Array.from({ length: 20 }, () => Array.from({ length: 10 }, () => null)),
    queue: ["I", "O", "T"],
    targetLines: 1,
    movesLimit: 5,
    ...overrides,
  };
}

describe("storage", () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it("loadStorage returns fallback when nothing is persisted", () => {
    const state = loadStorage();
    expect(state.recent).toEqual([]);
    expect(state.soundOn).toBe(true);
    expect(state.clears).toBe(0);
    expect(state.plays).toBe(0);
  });

  it("loadStorage tolerates corrupt JSON gracefully", () => {
    localStorage.setItem(STORAGE_KEY, "{not-valid-json");
    const state = loadStorage();
    expect(state.plays).toBe(0);
  });

  it("rememberPuzzle persists puzzle and increments plays", () => {
    rememberPuzzle(makePuzzle(42), false);
    const state = loadStorage();
    expect(state.plays).toBe(1);
    expect(state.clears).toBe(0);
    expect(state.recent[0].seed).toBe(42);
    expect(state.lastSeed).toBe(42);
  });

  it("rememberPuzzle increments clears only when cleared=true", () => {
    rememberPuzzle(makePuzzle(1), true);
    rememberPuzzle(makePuzzle(2), false);
    rememberPuzzle(makePuzzle(3), true);
    const state = loadStorage();
    expect(state.plays).toBe(3);
    expect(state.clears).toBe(2);
  });

  it("rememberPuzzle deduplicates by seed (recent has unique seeds)", () => {
    rememberPuzzle(makePuzzle(7), false);
    rememberPuzzle(makePuzzle(7), true);
    const state = loadStorage();
    const sevens = state.recent.filter((p) => p.seed === 7);
    expect(sevens).toHaveLength(1);
    expect(sevens[0].cleared).toBe(true);
  });

  it("rememberPuzzle caps recent list at 20 entries", () => {
    for (let i = 0; i < 30; i += 1) {
      rememberPuzzle(makePuzzle(i), false);
    }
    const state = loadStorage();
    expect(state.recent).toHaveLength(20);
    // Most recent at the front
    expect(state.recent[0].seed).toBe(29);
  });

  it("setSoundOn persists the sound preference", () => {
    setSoundOn(false);
    expect(loadStorage().soundOn).toBe(false);
    setSoundOn(true);
    expect(loadStorage().soundOn).toBe(true);
  });
});
