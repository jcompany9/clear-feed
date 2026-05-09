import { describe, it, expect } from "vitest";
import { findSolvableQueue, solve } from "./solver";
import { COLS, ROWS, type Cell, type Difficulty, type PieceKind, type Puzzle } from "./gameTypes";
import { createFeedPuzzle } from "./puzzleGenerator";

/** 결정론적 RNG (테스트 안정성) — 시드 기반 LCG */
function makeSeededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function emptyGrid(): Cell[][] {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));
}

function makePuzzle(grid: Cell[][], queue: PieceKind[], overrides: Partial<Puzzle> = {}): Puzzle {
  return {
    seed: 1,
    template: "near-line",
    difficulty: "Easy" as Difficulty,
    grid,
    queue,
    targetLines: 1,
    movesLimit: queue.length,
    ...overrides,
  };
}

describe("solver — base cases", () => {
  it("empty grid + empty queue + targetLines=0 → trivially solvable (perfect-clear path)", () => {
    const result = solve(makePuzzle(emptyGrid(), [], { targetLines: 0 }));
    expect(result.solvable).toBe(true);
    expect(result.truncated).toBe(false);
  });

  it("empty grid + empty queue + targetLines=1 → unsolvable (no lines cleared)", () => {
    const result = solve(makePuzzle(emptyGrid(), []));
    expect(result.solvable).toBe(false);
  });

  it("empty grid + 1 piece + targetLines=0 → unsolvable (piece leaves 4 cells)", () => {
    const result = solve(makePuzzle(emptyGrid(), ["O"], { targetLines: 0 }));
    expect(result.solvable).toBe(false);
    expect(result.truncated).toBe(false);
  });
});

describe("solver — line-clear scenarios", () => {
  it("row 19 with center gap 4 + I-piece → solvable (line clears, board empty)", () => {
    const grid = emptyGrid();
    // 행 19: 0,1,2 + 7,8,9 채우고 3~6 비움 (4칸 갭)
    grid[19] = ["I", "I", "I", null, null, null, null, "I", "I", "I"];
    const result = solve(makePuzzle(grid, ["I"]));
    expect(result.solvable).toBe(true);
    expect(result.steps).toBeDefined();
    expect(result.steps!).toHaveLength(1);
    expect(result.steps![0].kind).toBe("I");
  });

  it("row 19 with gap 2 + I-piece → unsolvable (I-rot0 is 4 wide, won't fit horizontally; rot1 vertical doesn't clear row)", () => {
    const grid = emptyGrid();
    grid[19] = ["I", "I", "I", "I", null, null, "I", "I", "I", "I"];
    const result = solve(makePuzzle(grid, ["I"]));
    expect(result.solvable).toBe(false);
  });

  it("row 19 with gap 2 + O-piece → solvable (O fills 2x2)", () => {
    const grid = emptyGrid();
    // O는 2x2이므로 가로폭 2 갭은 채울 수 있지만 row 18에도 2칸 남음 → not empty.
    // 그래서 row 18, 19가 모두 4칸 남기고 채워진 상태로 만들어 O로 두 줄을 한번에 클리어:
    grid[18] = ["I", "I", "I", "I", null, null, "I", "I", "I", "I"];
    grid[19] = ["I", "I", "I", "I", null, null, "I", "I", "I", "I"];
    const result = solve(makePuzzle(grid, ["O"]));
    expect(result.solvable).toBe(true);
  });
});

describe("solver — truncated", () => {
  it("returns truncated=true when maxNodes exceeded, solvable defaults to false", () => {
    // 큐가 길어서 검색공간이 커지는 경우
    const grid = emptyGrid();
    // 6 pieces but unrealistic — 1 node max means immediate truncation
    const result = solve(makePuzzle(grid, ["T", "T", "T", "T", "T", "T"]), 1);
    expect(result.truncated).toBe(true);
    expect(result.solvable).toBe(false);
  });
});

describe("solver — SolverStep shape", () => {
  it("steps array entries have queueIndex, kind, x, rotation", () => {
    const grid = emptyGrid();
    grid[19] = ["I", "I", "I", null, null, null, null, "I", "I", "I"];
    const result = solve(makePuzzle(grid, ["I"]));
    expect(result.solvable).toBe(true);
    const step = result.steps![0];
    expect(step.queueIndex).toBe(0);
    expect(step.kind).toBe("I");
    expect(typeof step.x).toBe("number");
    expect(typeof step.rotation).toBe("number");
    expect(step.rotation).toBeGreaterThanOrEqual(0);
    expect(step.rotation).toBeLessThan(4);
  });
});

describe("findSolvableQueue", () => {
  it("finds a 1-piece queue that solves a row-19-with-4-gap board", () => {
    const grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null as Cell));
    grid[19] = ["I", "I", "I", null, null, null, null, "I", "I", "I"];
    const found = findSolvableQueue(grid, 1, 50, makeSeededRng(42));
    expect(found).not.toBeNull();
    expect(found!.queue).toHaveLength(1);
    // I-piece가 가장 명확한 풀이 — 발견된 큐로 다시 solve 했을 때 풀려야 함
    const verify = solve({
      seed: 0,
      template: "near-line",
      difficulty: "Easy" as Difficulty,
      grid,
      queue: found!.queue,
      targetLines: 0,
      movesLimit: 1,
    });
    expect(verify.solvable).toBe(true);
  });

  it("returns null when board is unclearable (walls prevent clearing forever)", () => {
    const grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null as Cell));
    // 행 1에 벽 + 다른 셀 — 절대 클리어 불가 (벽이 클리어 막음)
    grid[1] = ["wall", "wall", null, null, null, null, null, null, "wall", "wall"];
    grid[19] = ["I", "I", "I", null, null, null, null, "I", "I", "I"];
    const found = findSolvableQueue(grid, 1, 8, makeSeededRng(7));
    expect(found).toBeNull();
  });

  it("returns the requested queue length when found", () => {
    const grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null as Cell));
    grid[19] = ["I", "I", "I", null, null, null, null, "I", "I", "I"];
    const found = findSolvableQueue(grid, 1, 30, makeSeededRng(100));
    expect(found).not.toBeNull();
    expect(found!.queue).toHaveLength(1);
    expect(found!.attempts).toBeGreaterThanOrEqual(1);
    expect(found!.attempts).toBeLessThanOrEqual(30);
    expect(found!.steps).toBeDefined();
  });
});

describe("solver — robust on generator outputs", () => {
  it("does not crash on first generator puzzle (returns either solvable, unsolvable, or truncated within budget)", () => {
    const puzzle = createFeedPuzzle(2026);
    const result = solve(puzzle, 50000);
    expect(typeof result.solvable).toBe("boolean");
    expect(typeof result.truncated).toBe("boolean");
    expect(result.timeMs).toBeGreaterThanOrEqual(0);
    expect(result.nodesExplored).toBeGreaterThan(0);
  });

  it("handles 'wall' cells (immovable) — never tries to clear walled rows", () => {
    const grid = emptyGrid();
    // 천장에 벽 + 갭이 있을 때, 솔버가 그 줄을 못 클리어해야 정상
    grid[0] = ["wall", "wall", null, null, null, "wall", "wall", "wall", "wall", "wall"];
    grid[19] = ["I", "I", "I", null, null, null, null, "I", "I", "I"];
    const result = solve(makePuzzle(grid, ["I"]));
    // I-piece can clear row 19 but row 0 (with walls) remains forever — unsolvable
    expect(result.solvable).toBe(false);
  });
});
