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
  /** 보드 행 (바닥부터 위로). 각 행 길이 10.
   *  '#' = 일반 셀 (garbage 회색)
   *  '@' = 타겟 셀 (주황 — 클리어해야 할 미션 셀)
   *  '.' = 빈칸 */
  rowsFromBottom: string[];
  queue: PieceKind[];
  targetLines: number;       // 라인 미션 (타겟 미션이면 0 으로 두면 됨)
  difficulty: Difficulty;
  /** 디버그/검색용 라벨 (선택) */
  name?: string;
}

/**
 * 큐레이션 풀. 사용자가 디자인 + AI 검증 거친 퍼즐만 추가.
 * 비어있으면 무작위 fallback (game.ts 가 폴백 처리).
 */
export const CURATED_PUZZLES: CuratedPuzzleSpec[] = [
  // Perfect-clear 워밍업 — row 19 4-gap + I-piece 1개로 1 라인 = 0 블록
  {
    name: "warmup-i-gap",
    rowsFromBottom: ["###....###"],
    queue: ["I"],
    targetLines: 0,
    difficulty: "Easy",
  },
  // 타겟 미션 예제 — 주황 셀 2개를 클리어 (라인 만들면서)
  // row 19: 양 끝 살짝 비고, 가운데 4-gap. 그 4-gap 안에 타겟 2개가 박혀있는 모양은 불가
  // (타겟 = 채운 셀이라 gap 못 됨). 대신 타겟을 row 19 양옆에 두고 I 로 라인 클리어해서 함께 제거.
  {
    name: "target-2-corners",
    rowsFromBottom: ["@##....##@"],
    queue: ["I"],
    targetLines: 0,  // 타겟 미션은 targetLines 0 (사용 안 함)
    difficulty: "Easy",
  },
  // Perfect Clear 미션 — 타겟 없음 + targetLines 0 → 보드 0블록이 목표
  // row 19: 6칸 채움 + 4칸 빈. I-piece 가로로 빈 4칸 채움 → 1라인 클리어 → 보드 비움 ✓
  {
    name: "pc-warmup-i",
    rowsFromBottom: ["######...."],
    queue: ["I"],
    targetLines: 0,
    difficulty: "Easy",
  },
  // Perfect Clear (2피스) — 두 줄 모두 4칸씩 비움. I 두 개로 각 줄 채우면 2라인 클리어 → 보드 0 ✓
  {
    name: "pc-double-i",
    rowsFromBottom: ["######....", "....######"],
    queue: ["I", "I"],
    targetLines: 0,
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
      const ch = text[x];
      grid[y][x] = ch === "#" ? ("garbage" as Cell)
                : ch === "@" ? ("target" as Cell)
                : null;
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
