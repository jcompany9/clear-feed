import { COLS, ROWS, type Cell, type Difficulty, type Piece, type PieceKind, type Puzzle } from "./gameTypes";
import { absoluteCells, createPiece, rotatePiece } from "./pieces";

const ALL_KINDS: PieceKind[] = ["I", "O", "T", "L", "J", "S", "Z"];

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
  // 성공 조건: targetLines>0 면 라인 N개 도달, 아니면 perfect-clear (UGC 폴백)
  const target = puzzle.targetLines;

  function recurse(grid: Cell[][], i: number, linesCleared: number): boolean {
    if (truncated) return false;
    nodesExplored += 1;
    if (nodesExplored > maxNodes) {
      truncated = true;
      return false;
    }

    if (target > 0 && linesCleared >= target) return true;

    if (i >= puzzle.queue.length) {
      return target === 0 ? isEmpty(grid) : false;
    }

    const key = `${i}|${linesCleared}|${gridKey(grid)}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    const kind = puzzle.queue[i];
    const rotations = ROTATIONS_PER_KIND[kind];

    let result = false;
    outer: for (let rot = 0; rot < rotations; rot += 1) {
      const sample = rotateNTimes(createPiece(kind), rot);
      const minRel = Math.min(...sample.cells.map((c) => c.x));
      const maxRel = Math.max(...sample.cells.map((c) => c.x));
      const xMin = -minRel;
      const xMax = COLS - 1 - maxRel;

      for (let col = xMin; col <= xMax; col += 1) {
        const piece = simulateDrop(grid, kind, col, rot);
        if (!piece) continue;
        const cleared = clearLines(applyPiece(grid, piece));
        path.push({ queueIndex: i, kind, x: col, rotation: rot });
        if (recurse(cleared.grid, i + 1, linesCleared + cleared.cleared)) {
          result = true;
          break outer;
        }
        path.pop();
      }
    }

    cache.set(key, result);
    return result;
  }

  const solvable = recurse(cloneGrid(puzzle.grid), 0, 0);

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

export interface FoundQueue {
  queue: PieceKind[];
  steps: SolverStep[];
  attempts: number;
  totalTimeMs: number;
}

/**
 * 사용자가 디자인한 보드(grid)에 대해 풀이 가능한 큐를 찾는다.
 * 무작위 큐 생성 → solve() 검증 반복.
 *
 * @param grid     사용자가 쌓은 보드 (사전 채움)
 * @param length   큐 길이 (피스 개수)
 * @param maxAttempts 시도 한도 (기본 50)
 * @param rng      난수 함수 (테스트용 — 기본은 Math.random)
 * @returns        풀리는 큐 + 풀이 시퀀스, 못 찾으면 null
 */
export function findSolvableQueue(
  grid: Cell[][],
  length: number,
  maxAttempts = 50,
  rng: () => number = Math.random,
  maxNodes = 200000,
  targetLines = 0,
): FoundQueue | null {
  const start = performance.now();
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const queue: PieceKind[] = [];
    for (let i = 0; i < length; i += 1) {
      // 연속 중복 방지 — 큐 다양성 ↑
      let kind: PieceKind;
      do {
        kind = ALL_KINDS[Math.floor(rng() * ALL_KINDS.length)];
      } while (queue.length > 0 && kind === queue[queue.length - 1]);
      queue.push(kind);
    }
    const probe: Puzzle = {
      seed: 0,
      template: "near-line",
      difficulty: "Easy" as Difficulty,
      grid,
      queue,
      targetLines,
      movesLimit: length,
    };
    const result = solve(probe, maxNodes);
    if (result.solvable && result.steps) {
      return {
        queue,
        steps: result.steps,
        attempts: attempt,
        totalTimeMs: performance.now() - start,
      };
    }
  }
  return null;
}

export interface AnalysisResult {
  solutionCount: number;   // 0..maxSolutions (capped 시 capped=true)
  capped: boolean;         // maxSolutions 도달 → 실제론 더 많을 수 있음
  truncated: boolean;      // maxNodes 초과 → 결과 미확정
  minSteps: number;        // 가장 짧은 풀이의 큐 사용 수 (없으면 -1)
  nodesExplored: number;
  timeMs: number;
}

/**
 * 퍼즐의 풀이 개수와 난이도 지표를 측정.
 * 풀이 1개만 찾는 solve()와 달리 모든 분기 탐색 (maxSolutions 까지 cap).
 *
 * 난이도 판정:
 * - solutionCount 많음 = 다양한 경로로 풀림 (Easy)
 * - 1개 = 정해진 한 길만 있음 (Challenge)
 * - 0 = 풀 수 없음
 *
 * 메모이제이션은 안 씀 (count 누적이 cache 와 호환 안 됨).
 */
export function analyze(puzzle: Puzzle, maxSolutions = 5, maxNodes = 30000): AnalysisResult {
  const start = performance.now();
  let solutions = 0;
  let nodesExplored = 0;
  let truncated = false;
  let minSteps = -1;
  const target = puzzle.targetLines;

  function recordSolution(stepsUsed: number): void {
    solutions += 1;
    if (minSteps === -1 || stepsUsed < minSteps) minSteps = stepsUsed;
  }

  function recurse(grid: Cell[][], i: number, linesCleared: number): void {
    if (truncated || solutions >= maxSolutions) return;
    nodesExplored += 1;
    if (nodesExplored > maxNodes) {
      truncated = true;
      return;
    }

    if (target > 0 && linesCleared >= target) {
      recordSolution(i);
      return;
    }

    if (i >= puzzle.queue.length) {
      if (target === 0 && isEmpty(grid)) recordSolution(i);
      return;
    }

    const kind = puzzle.queue[i];
    const rotations = ROTATIONS_PER_KIND[kind];

    for (let rot = 0; rot < rotations; rot += 1) {
      if (solutions >= maxSolutions || truncated) return;
      const sample = rotateNTimes(createPiece(kind), rot);
      const minRel = Math.min(...sample.cells.map((c) => c.x));
      const maxRel = Math.max(...sample.cells.map((c) => c.x));
      const xMin = -minRel;
      const xMax = COLS - 1 - maxRel;

      for (let col = xMin; col <= xMax; col += 1) {
        if (solutions >= maxSolutions || truncated) return;
        const piece = simulateDrop(grid, kind, col, rot);
        if (!piece) continue;
        const cleared = clearLines(applyPiece(grid, piece));
        recurse(cleared.grid, i + 1, linesCleared + cleared.cleared);
      }
    }
  }

  recurse(cloneGrid(puzzle.grid), 0, 0);

  return {
    solutionCount: solutions,
    capped: solutions >= maxSolutions,
    truncated,
    minSteps,
    nodesExplored,
    timeMs: performance.now() - start,
  };
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

function clearLines(grid: Cell[][]): { grid: Cell[][]; cleared: number } {
  const fullRows = grid
    .map((row, y) => (row.every(Boolean) && !row.some((cell) => cell === "wall") ? y : -1))
    .filter((r) => r >= 0);
  if (!fullRows.length) return { grid, cleared: 0 };
  let result = grid.filter((_, y) => !fullRows.includes(y));
  while (result.length < ROWS) {
    result = [Array.from({ length: COLS }, () => null), ...result];
  }
  return { grid: result, cleared: fullRows.length };
}
