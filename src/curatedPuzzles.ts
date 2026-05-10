/**
 * 사용자 디자인 + AI 검증 큐레이션 퍼즐 풀.
 *
 * 워크플로:
 *   1. 사용자가 에디터(drop-from-top)로 보드 디자인
 *   2. 보드 텍스트/JSON 으로 추출 → 이 파일에 추가
 *   3. AI 가 findSolvableQueue 로 큐 계산
 *   4. 검증된 (board, queue, targetLines, difficulty) 저장
 *   5. 게임이 셔플 시 이 풀에서 무작위로 뽑음
 *
 * 보드 표기 규칙 (간결한 JSON):
 *   "##.######" 같은 문자열 — '#' = 채움, '.' = 빈칸
 *   각 row 길이 10. 위쪽은 비워두고 바닥부터 채움.
 */
import { COLS, ROWS, type Cell, type Difficulty, type PieceKind, type Puzzle } from "./gameTypes";

export interface CuratedPuzzleSpec {
  /** 보드 행 (바닥부터 위로). 길이 1~20. 각 행 길이 10. '#' = 채움, '.' = 빈칸 */
  rowsFromBottom: string[];
  queue: PieceKind[];
  targetLines: number;
  difficulty: Difficulty;
  /** 디버그/검색용 라벨 (선택) */
  name?: string;
}

/**
 * 큐레이션 풀. 사용자가 디자인 + AI 검증 거친 퍼즐만 추가.
 * 비어있으면 무작위 fallback (game.ts 가 폴백 처리).
 */
export const CURATED_PUZZLES: CuratedPuzzleSpec[] = [
  // 예제 1: 간단한 시드 — 바닥 row 19 에 4-gap, queue [I]
  // (실제로는 사용자가 에디터로 디자인 후 추가)
  {
    name: "warmup-i-gap",
    rowsFromBottom: ["###....###"],
    queue: ["I"],
    targetLines: 1,
    difficulty: "Easy",
  },
];

/** 큐레이션 spec 을 게임의 Puzzle 형식으로 변환 */
export function specToPuzzle(spec: CuratedPuzzleSpec, seed: number): Puzzle {
  const grid: Cell[][] = [];
  for (let y = 0; y < ROWS; y += 1) {
    const row: Cell[] = [];
    for (let x = 0; x < COLS; x += 1) row.push(null);
    grid.push(row);
  }
  // rowsFromBottom: index 0 → 바닥 (row 19), index 1 → row 18, ...
  for (let i = 0; i < spec.rowsFromBottom.length && i < ROWS; i += 1) {
    const y = ROWS - 1 - i;
    const text = spec.rowsFromBottom[i];
    for (let x = 0; x < COLS && x < text.length; x += 1) {
      grid[y][x] = text[x] === "#" ? ("garbage" as Cell) : null;
    }
  }
  return {
    seed,
    template: "near-line",
    difficulty: spec.difficulty,
    grid,
    queue: [...spec.queue],
    targetLines: spec.targetLines,
    movesLimit: spec.queue.length,
  };
}

/**
 * 풀에서 무작위 큐레이션 퍼즐 1개 반환. 풀이 비었거나 selector 가 매칭 없으면 null.
 */
export function pickCuratedPuzzle(seed: number, difficulty?: Difficulty): Puzzle | null {
  const pool = difficulty
    ? CURATED_PUZZLES.filter((p) => p.difficulty === difficulty)
    : CURATED_PUZZLES;
  if (pool.length === 0) return null;
  const idx = Math.floor(Math.random() * pool.length);
  return specToPuzzle(pool[idx], seed);
}
