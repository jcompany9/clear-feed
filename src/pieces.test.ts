import { describe, it, expect } from "vitest";
import { absoluteCells, createPiece, PIECES, rotatePiece } from "./pieces";

describe("PIECES", () => {
  it("contains all 7 tetromino kinds", () => {
    expect(PIECES.sort()).toEqual(["I", "J", "L", "O", "S", "T", "Z"].sort());
  });
});

describe("createPiece", () => {
  it("spawns at column 4, row 1", () => {
    const piece = createPiece("T");
    expect(piece.x).toBe(4);
    expect(piece.y).toBe(1);
    expect(piece.kind).toBe("T");
  });

  it("returns 4-cell shape for every kind", () => {
    for (const kind of PIECES) {
      const piece = createPiece(kind);
      expect(piece.cells).toHaveLength(4);
    }
  });

  it("returns independent cells (no shared reference between piece instances)", () => {
    const a = createPiece("T");
    const b = createPiece("T");
    a.cells[0].x = 999;
    expect(b.cells[0].x).not.toBe(999);
  });
});

describe("rotatePiece", () => {
  it("leaves O-piece invariant", () => {
    const piece = createPiece("O");
    const rotated = rotatePiece(piece);
    expect(rotated.cells).toEqual(piece.cells);
  });

  it("rotates 90° clockwise: (x, y) -> (-y, x)", () => {
    const piece = createPiece("T");
    // T: [-1,0], [0,0], [1,0], [0,1] → after rotate: [0,-1], [0,0], [0,1], [-1,0]
    const rotated = rotatePiece(piece);
    // Normalize -0 → 0 (rotation produces -0 from -cell.y when cell.y === 0)
    const norm = (c: { x: number; y: number }) => ({ x: c.x + 0, y: c.y + 0 });
    expect(rotated.cells.map(norm)).toEqual([
      { x: 0, y: -1 },
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ]);
  });

  it("returns to original after 4 rotations (mod symmetry)", () => {
    const piece = createPiece("L");
    const four = rotatePiece(rotatePiece(rotatePiece(rotatePiece(piece))));
    expect(four.cells).toEqual(piece.cells);
  });
});

describe("absoluteCells", () => {
  it("translates relative cells to absolute coordinates", () => {
    const piece = createPiece("I");
    expect(absoluteCells(piece)).toEqual([
      { x: 3, y: 1 },
      { x: 4, y: 1 },
      { x: 5, y: 1 },
      { x: 6, y: 1 },
    ]);
  });
});
