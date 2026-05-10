/**
 * 테트리스 퍼즐 솔버 + 문제 생성기 + 난이도 판별기.
 *
 * 일반 낙하형 테트리스가 아니라, 정해진 보드에 정해진 블록 목록으로
 * 목표 라인을 삭제하는 "퍼즐형" 게임용. 블록은 빈 공간에 직접 배치 가능
 * (placementMode = "free"). 추후 "drop" 모드 확장 가능.
 *
 * 핵심 흐름:
 *   solvePuzzle(board, pieces, mission)
 *     → searchRecursive (모든 풀이 경로 수집, memo + maxSolutions 가지치기)
 *     → analyzeSolutions (정답 분석 + 통계)
 *     → classifyDifficulty (Easy/Normal/Hard/Challenge/rejected)
 *
 *   generatePuzzle(options)
 *     → 랜덤 보드 + 랜덤 큐 → evaluatePuzzle → 조건 통과한 것만 반환
 *
 * 외부 의존성 없음. strict TS, no `any`.
 */

// ============================================================================
// 1. 타입 정의
// ============================================================================

export type Cell = 0 | 1;
export type Board = Cell[][];
export type PieceType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
export type Shape = Cell[][];
export type Difficulty = "easy" | "normal" | "hard" | "challenge";
export type DifficultyLabel = Difficulty | "rejected";

/** 추후 확장용 — 현재는 "free" 만 지원 */
export type PlacementMode = "free" | "drop";

export interface Mission {
  targetLines: number;
  exactClearLines: boolean;
  mustUseAllPieces: boolean;
  maxSolutions: number | null;
  difficulty: Difficulty;
}

export interface Placement {
  piece: PieceType;
  rotationIndex: number;
  shape: Shape;
  x: number;
  y: number;
}

export interface Move extends Placement {
  linesCleared: number;
  boardAfterClear: Board;
}

export interface Solution {
  totalCleared: number;
  piecesUsed: number;
  moves: Move[];
}

export interface SolverStats {
  solvable: boolean;
  solutionCount: number;
  successfulFirstMoves: number;
  firstMoveKeys: string[];
  minPiecesUsed: number;
  maxPiecesUsed: number;
  clearTimingPatterns: number[][];
  firstClearMoveIndexList: number[];
  finalMoveMaxClearLines: number;
  hasNoClearOnFirstMoveSolution: boolean;
  hasNoClearBeforeLastTwoMovesSolution: boolean;
  hasNoClearBeforeFinalMoveSolution: boolean;
  hasFinalMoveMultiClear: boolean;
  hasTetrisClear: boolean;
  difficultyScore: number;
  difficultyLabel: DifficultyLabel;
}

export interface SolveResult {
  solvable: boolean;
  solutionCount: number;
  solutions: Solution[];
  stats: SolverStats;
}

export interface GeneratePuzzleOptions {
  width: number;
  height: number;
  difficulty: Difficulty;
  targetLines: number;
  maxAttempts: number;
}

export interface GeneratedPuzzle {
  board: Board;
  pieces: PieceType[];
  mission: Mission;
  solution: Solution | null;
  solutionCount: number;
  stats: SolverStats;
}

export interface ClearFullLinesResult {
  board: Board;
  linesCleared: number;
}

export interface ObviousFitStats {
  immediateClearMoves: number;
  firstPieceImmediateClearMoves: number;
  iPieceImmediateClearMoves: number;
  obviousScore: number;
}

// ============================================================================
// 2. 상수 — 블록 기본 모양
// ============================================================================

const PIECE_SHAPES: Record<PieceType, Shape> = {
  I: [[1, 1, 1, 1]],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
  ],
};

const ALL_PIECE_TYPES: readonly PieceType[] = ["I", "O", "T", "S", "Z", "J", "L"];

// ============================================================================
// 3. 보드 유틸
// ============================================================================

export function createEmptyBoard(width: number, height: number): Board {
  const board: Board = [];
  for (let y = 0; y < height; y += 1) {
    const row: Cell[] = [];
    for (let x = 0; x < width; x += 1) row.push(0);
    board.push(row);
  }
  return board;
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.slice());
}

export function boardToKey(board: Board): string {
  let s = "";
  for (let y = 0; y < board.length; y += 1) {
    const row = board[y];
    for (let x = 0; x < row.length; x += 1) s += row[x] === 1 ? "1" : "0";
    s += "/";
  }
  return s;
}

function shapeKey(shape: Shape): string {
  return shape.map((r) => r.join("")).join("/");
}

// ============================================================================
// 4. 블록 모양 / 회전
// ============================================================================

export function getPieceBaseShape(pieceType: PieceType): Shape {
  return PIECE_SHAPES[pieceType].map((row) => row.slice());
}

export function rotateShape(shape: Shape): Shape {
  const rows = shape.length;
  const cols = rows > 0 ? shape[0].length : 0;
  const result: Shape = [];
  for (let j = 0; j < cols; j += 1) {
    const newRow: Cell[] = [];
    for (let i = rows - 1; i >= 0; i -= 1) newRow.push(shape[i][j]);
    result.push(newRow);
  }
  return result;
}

export function normalizeShape(shape: Shape): Shape {
  const rows = shape.length;
  if (rows === 0) return [];
  const cols = shape[0].length;
  if (cols === 0) return [];
  let top = rows;
  let bottom = -1;
  let left = cols;
  let right = -1;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (shape[y][x] === 1) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (bottom < 0) return [];
  const trimmed: Shape = [];
  for (let y = top; y <= bottom; y += 1) {
    const row: Cell[] = [];
    for (let x = left; x <= right; x += 1) row.push(shape[y][x]);
    trimmed.push(row);
  }
  return trimmed;
}

export function getUniqueRotations(pieceType: PieceType): Shape[] {
  const seen = new Set<string>();
  const result: Shape[] = [];
  let current = normalizeShape(getPieceBaseShape(pieceType));
  for (let i = 0; i < 4; i += 1) {
    const k = shapeKey(current);
    if (!seen.has(k)) {
      seen.add(k);
      result.push(current);
    }
    current = normalizeShape(rotateShape(current));
  }
  return result;
}

// 캐시 — getUniqueRotations 결과는 PieceType 별 고정
const ROTATION_CACHE: Partial<Record<PieceType, Shape[]>> = {};
function getCachedRotations(pieceType: PieceType): Shape[] {
  const cached = ROTATION_CACHE[pieceType];
  if (cached) return cached;
  const rots = getUniqueRotations(pieceType);
  ROTATION_CACHE[pieceType] = rots;
  return rots;
}

// ============================================================================
// 5. 배치 / 라인 클리어
// ============================================================================

export function canPlace(board: Board, shape: Shape, x: number, y: number): boolean {
  const height = board.length;
  if (height === 0) return false;
  const width = board[0].length;
  const sh = shape.length;
  if (sh === 0) return false;
  const sw = shape[0].length;
  if (x < 0 || y < 0 || x + sw > width || y + sh > height) return false;
  for (let dy = 0; dy < sh; dy += 1) {
    const shapeRow = shape[dy];
    const boardRow = board[y + dy];
    for (let dx = 0; dx < sw; dx += 1) {
      if (shapeRow[dx] === 1 && boardRow[x + dx] === 1) return false;
    }
  }
  return true;
}

export function placePiece(board: Board, shape: Shape, x: number, y: number): Board {
  const next = cloneBoard(board);
  const sh = shape.length;
  if (sh === 0) return next;
  const sw = shape[0].length;
  for (let dy = 0; dy < sh; dy += 1) {
    for (let dx = 0; dx < sw; dx += 1) {
      if (shape[dy][dx] === 1) next[y + dy][x + dx] = 1;
    }
  }
  return next;
}

export function clearFullLines(board: Board): ClearFullLinesResult {
  const height = board.length;
  if (height === 0) return { board: cloneBoard(board), linesCleared: 0 };
  const width = board[0].length;
  const survivors: Board = [];
  let cleared = 0;
  for (let y = 0; y < height; y += 1) {
    const row = board[y];
    let full = true;
    for (let x = 0; x < width; x += 1) {
      if (row[x] !== 1) { full = false; break; }
    }
    if (full) cleared += 1;
    else survivors.push(row.slice());
  }
  // 위에 빈 행 cleared 만큼 추가
  const newBoard: Board = [];
  for (let i = 0; i < cleared; i += 1) {
    const row: Cell[] = [];
    for (let x = 0; x < width; x += 1) row.push(0);
    newBoard.push(row);
  }
  for (const row of survivors) newBoard.push(row);
  return { board: newBoard, linesCleared: cleared };
}

export function getAllPlacements(board: Board, pieceType: PieceType): Placement[] {
  const placements: Placement[] = [];
  const rotations = getCachedRotations(pieceType);
  const height = board.length;
  if (height === 0) return placements;
  const width = board[0].length;
  for (let r = 0; r < rotations.length; r += 1) {
    const shape = rotations[r];
    const sh = shape.length;
    if (sh === 0) continue;
    const sw = shape[0].length;
    for (let y = 0; y <= height - sh; y += 1) {
      for (let x = 0; x <= width - sw; x += 1) {
        if (canPlace(board, shape, x, y)) {
          placements.push({ piece: pieceType, rotationIndex: r, shape, x, y });
        }
      }
    }
  }
  return placements;
}

// ============================================================================
// 6. 미션 / 솔버
// ============================================================================

export function isMissionSuccess(
  totalCleared: number,
  usedAllPieces: boolean,
  mission: Mission,
): boolean {
  if (mission.mustUseAllPieces && !usedAllPieces) return false;
  if (mission.exactClearLines) return totalCleared === mission.targetLines;
  return totalCleared >= mission.targetLines;
}

export function searchRecursive(
  board: Board,
  pieces: PieceType[],
  index: number,
  totalCleared: number,
  path: Move[],
  solutions: Solution[],
  mission: Mission,
  memo: Set<string>,
): void {
  // 1. maxSolutions 가지치기
  if (mission.maxSolutions !== null && solutions.length >= mission.maxSolutions) return;
  // 2. exactClearLines 초과 가지치기
  if (mission.exactClearLines && totalCleared > mission.targetLines) return;

  const allUsed = index >= pieces.length;

  // 3. 모든 블록 사용 — 성공 여부 판정
  if (allUsed) {
    if (isMissionSuccess(totalCleared, true, mission)) {
      solutions.push({
        totalCleared,
        piecesUsed: path.length,
        moves: path.map((m) => ({ ...m, boardAfterClear: cloneBoard(m.boardAfterClear) })),
      });
    }
    return;
  }

  // 4. 중간 성공 (mustUseAllPieces=false 일 때만)
  if (!mission.mustUseAllPieces && path.length > 0) {
    if (isMissionSuccess(totalCleared, false, mission)) {
      solutions.push({
        totalCleared,
        piecesUsed: path.length,
        moves: path.map((m) => ({ ...m, boardAfterClear: cloneBoard(m.boardAfterClear) })),
      });
      // 중간 성공해도 계속 탐색 (더 긴 경로도 정답일 수 있음)
      if (mission.maxSolutions !== null && solutions.length >= mission.maxSolutions) return;
    }
  }

  // 5. memo (약한 적용 — 같은 (보드, index, totalCleared) 재방문 회피)
  const memoKey = `${boardToKey(board)}|${index}|${totalCleared}`;
  if (memo.has(memoKey)) return;
  memo.add(memoKey);

  // 6. 현재 블록의 모든 placement 탐색
  const piece = pieces[index];
  if (piece === undefined) return;
  const placements = getAllPlacements(board, piece);

  for (const p of placements) {
    if (mission.maxSolutions !== null && solutions.length >= mission.maxSolutions) return;
    const placed = placePiece(board, p.shape, p.x, p.y);
    const cleared = clearFullLines(placed);
    const move: Move = {
      piece: p.piece,
      rotationIndex: p.rotationIndex,
      shape: p.shape,
      x: p.x,
      y: p.y,
      linesCleared: cleared.linesCleared,
      boardAfterClear: cleared.board,
    };
    path.push(move);
    searchRecursive(
      cleared.board,
      pieces,
      index + 1,
      totalCleared + cleared.linesCleared,
      path,
      solutions,
      mission,
      memo,
    );
    path.pop();
  }
}

export function solvePuzzle(
  board: Board,
  pieces: PieceType[],
  mission: Mission,
): SolveResult {
  const solutions: Solution[] = [];
  const memo = new Set<string>();
  searchRecursive(cloneBoard(board), pieces, 0, 0, [], solutions, mission, memo);
  const stats = analyzeSolutions(solutions, pieces, mission);
  return {
    solvable: solutions.length > 0,
    solutionCount: solutions.length,
    solutions,
    stats,
  };
}

// ============================================================================
// 7. 분석
// ============================================================================

function moveKey(m: Move): string {
  return `${m.piece}:${m.rotationIndex}:${m.x}:${m.y}`;
}

export function analyzeSolutions(
  solutions: Solution[],
  pieces: PieceType[],
  mission: Mission,
): SolverStats {
  const solvable = solutions.length > 0;
  const solutionCount = solutions.length;

  const firstMoveSet = new Set<string>();
  for (const s of solutions) {
    if (s.moves.length > 0) firstMoveSet.add(moveKey(s.moves[0]));
  }
  const firstMoveKeys = [...firstMoveSet];
  const successfulFirstMoves = firstMoveKeys.length;

  let minPiecesUsed = 0;
  let maxPiecesUsed = 0;
  if (solvable) {
    minPiecesUsed = solutions[0].piecesUsed;
    maxPiecesUsed = solutions[0].piecesUsed;
    for (const s of solutions) {
      if (s.piecesUsed < minPiecesUsed) minPiecesUsed = s.piecesUsed;
      if (s.piecesUsed > maxPiecesUsed) maxPiecesUsed = s.piecesUsed;
    }
  }

  const clearTimingPatterns: number[][] = solutions.map((s) => s.moves.map((m) => m.linesCleared));

  const firstClearMoveIndexList: number[] = [];
  for (const pattern of clearTimingPatterns) {
    let idx = -1;
    for (let i = 0; i < pattern.length; i += 1) {
      if (pattern[i] > 0) { idx = i; break; }
    }
    firstClearMoveIndexList.push(idx);
  }

  let finalMoveMaxClearLines = 0;
  let hasNoClearOnFirstMoveSolution = false;
  let hasNoClearBeforeLastTwoMovesSolution = false;
  let hasNoClearBeforeFinalMoveSolution = false;
  let hasFinalMoveMultiClear = false;
  let hasTetrisClear = false;

  for (const pattern of clearTimingPatterns) {
    if (pattern.length === 0) continue;
    const last = pattern[pattern.length - 1];
    if (last > finalMoveMaxClearLines) finalMoveMaxClearLines = last;
    if (last >= 2) hasFinalMoveMultiClear = true;
    if (pattern[0] === 0) hasNoClearOnFirstMoveSolution = true;
    // 마지막 2개 이전이 모두 0인지
    let beforeLastTwoOk = true;
    for (let i = 0; i < pattern.length - 2; i += 1) {
      if (pattern[i] !== 0) { beforeLastTwoOk = false; break; }
    }
    if (beforeLastTwoOk) hasNoClearBeforeLastTwoMovesSolution = true;
    // 마지막 1개 이전이 모두 0인지
    let beforeFinalOk = true;
    for (let i = 0; i < pattern.length - 1; i += 1) {
      if (pattern[i] !== 0) { beforeFinalOk = false; break; }
    }
    if (beforeFinalOk) hasNoClearBeforeFinalMoveSolution = true;
    for (const cleared of pattern) {
      if (cleared >= 4) { hasTetrisClear = true; break; }
    }
  }

  // difficultyScore
  let difficultyScore = 0;
  if (solutionCount === 1) difficultyScore += 40;
  else if (solutionCount >= 2 && solutionCount <= 5) difficultyScore += 30;
  else if (solutionCount >= 6 && solutionCount <= 15) difficultyScore += 15;

  if (successfulFirstMoves === 1) difficultyScore += 25;
  else if (successfulFirstMoves >= 2 && successfulFirstMoves <= 4) difficultyScore += 15;

  if (hasNoClearBeforeFinalMoveSolution) difficultyScore += 25;
  if (hasNoClearBeforeLastTwoMovesSolution) difficultyScore += 15;
  if (hasFinalMoveMultiClear) difficultyScore += 10;
  if (hasTetrisClear) difficultyScore += 15;

  const partialStats: SolverStats = {
    solvable,
    solutionCount,
    successfulFirstMoves,
    firstMoveKeys,
    minPiecesUsed,
    maxPiecesUsed,
    clearTimingPatterns,
    firstClearMoveIndexList,
    finalMoveMaxClearLines,
    hasNoClearOnFirstMoveSolution,
    hasNoClearBeforeLastTwoMovesSolution,
    hasNoClearBeforeFinalMoveSolution,
    hasFinalMoveMultiClear,
    hasTetrisClear,
    difficultyScore,
    difficultyLabel: "rejected",
  };
  partialStats.difficultyLabel = classifyDifficulty(partialStats, pieces, mission);
  return partialStats;
}

// ============================================================================
// 8. 난이도 판별
// ============================================================================

export function countPieces(pieces: PieceType[]): Record<PieceType, number> {
  const counts: Record<PieceType, number> = { I: 0, O: 0, T: 0, S: 0, Z: 0, J: 0, L: 0 };
  for (const p of pieces) counts[p] += 1;
  return counts;
}

export function classifyDifficulty(
  stats: SolverStats,
  pieces: PieceType[],
  mission: Mission,
): DifficultyLabel {
  if (!stats.solvable) return "rejected";

  const pieceCount = pieces.length;
  const counts = countPieces(pieces);
  let maxSamePieceCount = 0;
  for (const t of ALL_PIECE_TYPES) {
    if (counts[t] > maxSamePieceCount) maxSamePieceCount = counts[t];
  }
  const iCount = counts.I;

  if (mission.difficulty === "easy") {
    if (stats.solutionCount >= 10 && stats.successfulFirstMoves >= 4) return "easy";
  }

  if (mission.difficulty === "normal") {
    if (
      mission.targetLines >= 2 &&
      mission.mustUseAllPieces &&
      pieceCount >= 4 && pieceCount <= 5 &&
      stats.solutionCount >= 5 && stats.solutionCount <= 15 &&
      stats.successfulFirstMoves >= 2 && stats.successfulFirstMoves <= 4 &&
      iCount <= 1 && maxSamePieceCount <= 2 &&
      stats.hasNoClearOnFirstMoveSolution
    ) return "normal";
  }

  if (mission.difficulty === "hard") {
    if (
      mission.targetLines >= 3 &&
      mission.mustUseAllPieces &&
      pieceCount >= 5 && pieceCount <= 6 &&
      stats.solutionCount >= 2 && stats.solutionCount <= 5 &&
      stats.successfulFirstMoves <= 2 &&
      iCount <= 1 && maxSamePieceCount <= 2 &&
      stats.hasNoClearBeforeLastTwoMovesSolution
    ) return "hard";
  }

  if (mission.difficulty === "challenge") {
    if (
      mission.targetLines >= 3 &&
      mission.mustUseAllPieces &&
      pieceCount >= 6 && pieceCount <= 8 &&
      stats.solutionCount === 1 &&
      stats.successfulFirstMoves === 1 &&
      iCount <= 1 && maxSamePieceCount <= 1 &&
      stats.hasNoClearBeforeFinalMoveSolution &&
      stats.finalMoveMaxClearLines >= 3
    ) return "challenge";
  }

  return "rejected";
}

// ============================================================================
// 9. 명백한 fit 탐지 (블록만 보고 답이 보이는 문제 제거)
// ============================================================================

export function detectObviousFits(board: Board, pieces: PieceType[]): ObviousFitStats {
  let immediateClearMoves = 0;
  let firstPieceImmediateClearMoves = 0;
  let iPieceImmediateClearMoves = 0;

  for (let i = 0; i < pieces.length; i += 1) {
    const piece = pieces[i];
    const placements = getAllPlacements(board, piece);
    for (const p of placements) {
      const placed = placePiece(board, p.shape, p.x, p.y);
      const cleared = clearFullLines(placed);
      if (cleared.linesCleared > 0) {
        immediateClearMoves += 1;
        if (i === 0) firstPieceImmediateClearMoves += 1;
        if (piece === "I") iPieceImmediateClearMoves += 1;
      }
    }
  }
  const obviousScore =
    immediateClearMoves * 2 +
    firstPieceImmediateClearMoves * 5 +
    iPieceImmediateClearMoves * 4;

  return {
    immediateClearMoves,
    firstPieceImmediateClearMoves,
    iPieceImmediateClearMoves,
    obviousScore,
  };
}

// ============================================================================
// 10. evaluatePuzzle — 전체 평가 파이프라인
// ============================================================================

function emptyRejectedResult(): SolveResult {
  const stats: SolverStats = {
    solvable: false,
    solutionCount: 0,
    successfulFirstMoves: 0,
    firstMoveKeys: [],
    minPiecesUsed: 0,
    maxPiecesUsed: 0,
    clearTimingPatterns: [],
    firstClearMoveIndexList: [],
    finalMoveMaxClearLines: 0,
    hasNoClearOnFirstMoveSolution: false,
    hasNoClearBeforeLastTwoMovesSolution: false,
    hasNoClearBeforeFinalMoveSolution: false,
    hasFinalMoveMultiClear: false,
    hasTetrisClear: false,
    difficultyScore: 0,
    difficultyLabel: "rejected",
  };
  return { solvable: false, solutionCount: 0, solutions: [], stats };
}

export function evaluatePuzzle(
  board: Board,
  pieces: PieceType[],
  mission: Mission,
): SolveResult {
  // 1. detectObviousFits 사전 검사 (Normal 이상)
  if (mission.difficulty !== "easy") {
    const obvious = detectObviousFits(board, pieces);
    if (mission.difficulty === "normal") {
      if (obvious.firstPieceImmediateClearMoves > 0) return emptyRejectedResult();
      if (obvious.iPieceImmediateClearMoves > 1) return emptyRejectedResult();
      if (obvious.obviousScore > 15) return emptyRejectedResult();
    } else if (mission.difficulty === "hard") {
      if (obvious.firstPieceImmediateClearMoves > 0) return emptyRejectedResult();
      if (obvious.iPieceImmediateClearMoves > 1) return emptyRejectedResult();
      if (obvious.obviousScore > 10) return emptyRejectedResult();
    } else if (mission.difficulty === "challenge") {
      if (obvious.firstPieceImmediateClearMoves > 0) return emptyRejectedResult();
      if (obvious.obviousScore > 6) return emptyRejectedResult();
    }
  }

  // 2. 솔버 실행
  const result = solvePuzzle(board, pieces, mission);
  if (result.stats.difficultyLabel !== mission.difficulty) {
    // 난이도 라벨 불일치 → rejected (단 실제 stats 는 유지하고 label 만 rejected 처리)
    const rejected: SolverStats = { ...result.stats, difficultyLabel: "rejected" };
    return { ...result, stats: rejected };
  }
  return result;
}

// ============================================================================
// 11. 랜덤 유틸
// ============================================================================

export function randomInt(min: number, max: number): number {
  if (max < min) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function shuffle<T>(array: readonly T[]): T[] {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

export function pickRandom<T>(array: readonly T[]): T {
  if (array.length === 0) throw new Error("pickRandom: empty array");
  const idx = Math.floor(Math.random() * array.length);
  return array[idx];
}

// ============================================================================
// 12. 랜덤 보드 / 큐 생성
// ============================================================================

interface RandomBoardOptions {
  width: number;
  height: number;
  difficulty: Difficulty;
}

function rowsForDifficulty(difficulty: Difficulty): { min: number; max: number } {
  if (difficulty === "easy") return { min: 3, max: 5 };
  if (difficulty === "normal") return { min: 4, max: 6 };
  if (difficulty === "hard") return { min: 5, max: 8 };
  return { min: 6, max: 10 };
}

function densityForDifficulty(difficulty: Difficulty): number {
  if (difficulty === "easy") return 0.45;
  if (difficulty === "normal") return 0.55;
  if (difficulty === "hard") return 0.65;
  return 0.7;
}

export function createRandomBoard(opts: RandomBoardOptions): Board {
  const { width, height, difficulty } = opts;
  const board = createEmptyBoard(width, height);
  const rng = rowsForDifficulty(difficulty);
  const usedRows = randomInt(rng.min, Math.min(rng.max, height));
  const density = densityForDifficulty(difficulty);
  const startRow = height - usedRows;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    // 한 번 시도해서 완성된 라인이 없는 보드를 만든다 (최대 8회 재시도)
    for (let y = startRow; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        board[y][x] = Math.random() < density ? 1 : 0;
      }
    }
    // 완성 라인 검사
    let hasFullLine = false;
    for (let y = startRow; y < height; y += 1) {
      let full = true;
      for (let x = 0; x < width; x += 1) {
        if (board[y][x] !== 1) { full = false; break; }
      }
      if (full) { hasFullLine = true; break; }
    }
    if (!hasFullLine) break;
    // 완성 라인 발견 → 빈 칸 1개 강제로 만들고 다시 검증
    if (attempt === 7) {
      for (let y = startRow; y < height; y += 1) {
        board[y][randomInt(0, width - 1)] = 0;
      }
    }
  }
  return board;
}

interface RandomPiecesOptions {
  difficulty: Difficulty;
  count: number;
}

function pieceCountRangeFor(difficulty: Difficulty): { min: number; max: number } {
  if (difficulty === "easy") return { min: 2, max: 3 };
  if (difficulty === "normal") return { min: 4, max: 5 };
  if (difficulty === "hard") return { min: 5, max: 6 };
  return { min: 6, max: 8 };
}

function maxIForDifficulty(difficulty: Difficulty): number {
  return difficulty === "easy" ? 99 : 1;
}

function maxSameForDifficulty(difficulty: Difficulty): number {
  if (difficulty === "easy") return 99;
  if (difficulty === "normal") return 2;
  if (difficulty === "hard") return 2;
  return 1;
}

function generateRandomPieces(opts: RandomPiecesOptions): PieceType[] {
  const { difficulty, count } = opts;
  const maxI = maxIForDifficulty(difficulty);
  const maxSame = maxSameForDifficulty(difficulty);
  const result: PieceType[] = [];
  const counts: Record<PieceType, number> = { I: 0, O: 0, T: 0, S: 0, Z: 0, J: 0, L: 0 };

  let safety = 0;
  while (result.length < count && safety < 200) {
    safety += 1;
    const candidate = pickRandom(ALL_PIECE_TYPES);
    if (candidate === "I" && counts.I >= maxI) continue;
    if (counts[candidate] >= maxSame) continue;
    if (result.length > 0 && result[result.length - 1] === candidate) continue;  // 연속 중복 방지
    result.push(candidate);
    counts[candidate] += 1;
  }
  // safety 빠져나옴 — 부족분은 아무거나 채움
  while (result.length < count) {
    result.push(pickRandom(ALL_PIECE_TYPES));
  }
  return result;
}

// ============================================================================
// 13. generatePuzzle — 메인 생성 진입점
// ============================================================================

export function generatePuzzle(options: GeneratePuzzleOptions): GeneratedPuzzle | null {
  const { width, height, difficulty, targetLines, maxAttempts } = options;
  const pieceRange = pieceCountRangeFor(difficulty);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const pieceCount = randomInt(pieceRange.min, pieceRange.max);
    const pieces = generateRandomPieces({ difficulty, count: pieceCount });
    const board = createRandomBoard({ width, height, difficulty });

    const mission: Mission = {
      targetLines,
      exactClearLines: false,
      mustUseAllPieces: difficulty !== "easy",
      maxSolutions: 200,
      difficulty,
    };

    const result = evaluatePuzzle(board, pieces, mission);
    if (result.stats.difficultyLabel === difficulty) {
      return {
        board,
        pieces,
        mission,
        solution: result.solutions[0] ?? null,
        solutionCount: result.solutionCount,
        stats: result.stats,
      };
    }
  }
  return null;
}
