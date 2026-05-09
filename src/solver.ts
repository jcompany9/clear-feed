import { COLS, ROWS, type Cell, type Piece, type PieceKind, type Puzzle } from "./gameTypes";
import { absoluteCells, createPiece, rotatePiece } from "./pieces";

/** 각 피스 종류의 고유 회전 수 (대칭 활용) */
const ROTATIONS_PER_KIND: Record<PieceKind, number> = {
  O: 1,
  I: 2,
  S: 2,
  Z: 2,
  T: 4,
  L: 4,
  J: 4,
};

export interface SolverStep {
  queueIndex: number;
  kind: PieceKind;
  x: number;
  rotation: number;
}

export interface SolverResult {
  solvable: boolean;          // 정답 찾음 (확정)
  truncated: boolean;         // maxNodes 초과 (미확정)
  steps?: SolverStep[];       // solvable일 때 풀이 시퀀스
  nodesExplored: number;
  timeMs: number;
}

/**
 * 퍼즐이 풀이 가능한지 (= 큐 모두 사용 후 보드가 비워지는 시퀀스가 존재하는지)
 * 검사. DFS + 메모이제이션 + 회전 대칭 활용.
 *
 * truncated=true 면 시간/노드 한계 초과 — solvable 결과는 신뢰 X.
 * 일반적으로 maxNodes 200000으로 충분 (5~7 피스 퍼즐).
 */
export function solve(puzzle: Puzzle, maxNodes = 200000): SolverResult {
  const start = performance.now();
  const cache = new Map<string, boolean>();
  let nodesExplored = 0;
  let truncated = false;
  const path: SolverStep[] = [];

  function recurse(grid: Cell[][], i: number): boolean {
    if (truncated) return false;
    nodesExplored += 1;
    if (nodesExplored > maxNodes) {
      truncated = true;
      return false;
    }

    if (i >= puzzle.queue.length) {
      return isEmpty(grid);
    }

    const key = `${i}|${gridKey(grid)}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    const kind = puzzle.queue[i];
    const rotations = ROTATIONS_PER_KIND[kind];

    let result = false;
    outer: for (let rot = 0; rot < rotations; rot += 1) {
      // 회전된 모양에서 유효 x 범위 (보드 안에 들어가는)
      const sample = rotateNTimes(createPiece(kind), rot);
      const minRel = Math.min(...sample.cells.map((c) => c.x));
      const maxRel = Math.max(...sample.cells.map((c) => c.x));
      const xMin = -minRel;
      const xMax = COLS - 1 - maxRel;

      for (let col = xMin; col <= xMax; col += 1) {
        const piece = simulateDrop(grid, kind, col, rot);
        if (!piece) continue;
        const next = clearLines(applyPiece(grid, piece));
        path.push({ queueIndex: i, kind, x: col, rotation: rot });
        if (recurse(next, i + 1)) {
          result = true;
          break outer;
        }
        path.pop();
      }
    }

    cache.set(key, result);
    return result;
  }

  const solvable = recurse(cloneGrid(puzzle.grid), 0);

  return {
    solvable: solvable && !truncated,
    truncated,
    steps: solvable && !truncated ? [...path] : undefined,
    nodesExplored,
    timeMs: performance.now() - start,
  };
}

function rotateNTimes(piece: Piece, n: number): Piece {
  let p = piece;
  for (let i = 0; i < n; i += 1) p = rotatePiece(p);
  return p;
}

function cloneGrid(grid: Cell[][]): Cell[][] {
  return grid.map((row) => [...row]);
}

function isEmpty(grid: Cell[][]): boolean {
  for (const row of grid) {
    for (const cell of row) {
      if (cell !== null) return false;
    }
  }
  return true;
}

function gridKey(grid: Cell[][]): string {
  let s = "";
  for (let y = 0; y < grid.length; y += 1) {
    const row = grid[y];
    for (let x = 0; x < row.length; x += 1) {
      const c = row[x];
      s += c === null ? "." : c === "wall" ? "W" : "#";
    }
  }
  return s;
}

function canPlaceOn(grid: Cell[][], piece: Piece): boolean {
  return absoluteCells(piece).every((cell) => {
    if (cell.x < 0 || cell.x >= COLS || cell.y >= ROWS) return false;
    if (cell.y < 0) return true;
    return !grid[cell.y][cell.x];
  });
}

function simulateDrop(grid: Cell[][], kind: PieceKind, col: number, rotation: number): Piece | null {
  let piece = createPiece(kind);
  for (let i = 0; i < rotation; i += 1) piece = rotatePiece(piece);
  piece = { ...piece, x: col, y: -2 };
  while (canPlaceOn(grid, { ...piece, y: piece.y + 1 })) {
    piece = { ...piece, y: piece.y + 1 };
  }
  if (!canPlaceOn(grid, piece)) return null;
  return piece;
}

function applyPiece(grid: Cell[][], piece: Piece): Cell[][] {
  const result = cloneGrid(grid);
  absoluteCells(piece).forEach((cell) => {
    if (cell.y >= 0 && cell.y < ROWS && cell.x >= 0 && cell.x < COLS) {
      result[cell.y][cell.x] = piece.kind;
    }
  });
  return result;
}

function clearLines(grid: Cell[][]): Cell[][] {
  const fullRows = grid
    .map((row, y) => (row.every(Boolean) && !row.some((cell) => cell === "wall") ? y : -1))
    .filter((r) => r >= 0);
  if (!fullRows.length) return grid;
  let result = grid.filter((_, y) => !fullRows.includes(y));
  while (result.length < ROWS) {
    result = [Array.from({ length: COLS }, () => null), ...result];
  }
  return result;
}
