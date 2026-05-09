import { describe, it, expect } from "vitest";
import { decodePuzzle, encodePuzzle } from "./encoding";
import { COLS, ROWS, type Cell, type PieceKind } from "./gameTypes";

function emptyGrid(): Cell[][] {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));
}

describe("encoding — round-trip", () => {
  it("empty grid + empty queue", () => {
    const grid = emptyGrid();
    const queue: PieceKind[] = [];
    const encoded = encodePuzzle(grid, queue);
    const decoded = decodePuzzle(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.grid).toEqual(grid);
    expect(decoded!.queue).toEqual(queue);
  });

  it("empty grid + 5-piece queue", () => {
    const grid = emptyGrid();
    const queue: PieceKind[] = ["I", "O", "T", "L", "S"];
    const encoded = encodePuzzle(grid, queue);
    const decoded = decodePuzzle(encoded);
    expect(decoded!.queue).toEqual(queue);
  });

  it("grid with garbage cells (UGC editor output)", () => {
    const grid = emptyGrid();
    grid[19] = ["garbage", null, "garbage", "garbage", null, null, null, "garbage", "garbage", "garbage"];
    grid[18] = [null, "garbage", null, null, null, null, null, null, "garbage", null];
    const queue: PieceKind[] = ["I", "T"];
    const encoded = encodePuzzle(grid, queue);
    const decoded = decodePuzzle(encoded);
    expect(decoded!.grid).toEqual(grid);
    expect(decoded!.queue).toEqual(queue);
  });

  it("grid with all 7 piece kinds + walls + garbage", () => {
    const grid = emptyGrid();
    grid[0] = ["wall", "wall", null, null, null, null, null, null, "wall", "wall"];
    grid[19] = ["I", "O", "T", "L", "J", "S", "Z", "garbage", "wall", null];
    const queue: PieceKind[] = ["Z", "S", "J", "L", "T", "O", "I"];
    const encoded = encodePuzzle(grid, queue);
    const decoded = decodePuzzle(encoded);
    expect(decoded!.grid).toEqual(grid);
    expect(decoded!.queue).toEqual(queue);
  });
});

describe("encoding — URL safety", () => {
  it("encoded output contains only URL-safe chars (A-Z a-z 0-9 - _)", () => {
    const grid = emptyGrid();
    grid[19] = ["garbage", "wall", "I", null, null, null, null, "Z", "garbage", "wall"];
    const encoded = encodePuzzle(grid, ["I", "O", "T", "L", "J", "S", "Z"]);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded).not.toContain("=");
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
  });

  it("encoded length is reasonable for typical UGC puzzle (under 400 chars)", () => {
    const grid = emptyGrid();
    grid[19] = ["garbage", "garbage", "garbage", null, null, null, null, "garbage", "garbage", "garbage"];
    const encoded = encodePuzzle(grid, ["I"]);
    expect(encoded.length).toBeLessThan(400);
    expect(encoded.length).toBeGreaterThan(50);
  });
});

describe("encoding — error handling", () => {
  it("returns null for malformed base64", () => {
    expect(decodePuzzle("not-valid-!!!base64!!!")).toBeNull();
  });

  it("returns null when decoded payload has no separator", () => {
    // base64url of "no-separator-here"
    const malformed = btoa("no-separator-here").replace(/=+$/, "");
    expect(decodePuzzle(malformed)).toBeNull();
  });

  it("returns null when grid string has wrong length", () => {
    // grid of 100 dots (should be 200), then ":I"
    const malformed = btoa(`${".".repeat(100)}:I`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(decodePuzzle(malformed)).toBeNull();
  });

  it("returns null when grid contains unknown char", () => {
    // 200 chars but with 'X' somewhere (not a valid cell char)
    const bad = ".".repeat(199) + "X";
    const encoded = btoa(`${bad}:I`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(decodePuzzle(encoded)).toBeNull();
  });

  it("returns null when queue contains unknown piece char", () => {
    const grid200 = ".".repeat(200);
    const encoded = btoa(`${grid200}:IXY`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(decodePuzzle(encoded)).toBeNull();
  });
});
