import type { Piece, PieceKind, Point } from "./gameTypes";

const SHAPES: Record<PieceKind, Point[]> = {
  I: [
    { x: -1, y: 0 },
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
  ],
  O: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ],
  T: [
    { x: -1, y: 0 },
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ],
  L: [
    { x: -1, y: 0 },
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
  ],
  J: [
    { x: -1, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ],
  S: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: -1, y: 1 },
    { x: 0, y: 1 },
  ],
  Z: [
    { x: -1, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ],
};

export const PIECES = Object.keys(SHAPES) as PieceKind[];

export function createPiece(kind: PieceKind): Piece {
  return {
    kind,
    cells: SHAPES[kind].map((cell) => ({ ...cell })),
    x: 4,
    y: 1,
  };
}

export function rotatePiece(piece: Piece): Piece {
  if (piece.kind === "O") return { ...piece, cells: piece.cells.map((cell) => ({ ...cell })) };
  return {
    ...piece,
    cells: piece.cells.map((cell) => ({ x: -cell.y, y: cell.x })),
  };
}

export function absoluteCells(piece: Piece): Point[] {
  return piece.cells.map((cell) => ({ x: piece.x + cell.x, y: piece.y + cell.y }));
}
