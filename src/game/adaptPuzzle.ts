/**
 * 신규 tetrisSolver 모듈 ↔ 기존 게임 (Game.ts) 사이 어댑터.
 *
 * 보드 표현 변환:
 *   tetrisSolver: Board = (0|1)[][]  — 단순 비트
 *   game:         Cell[][] = (PieceKind|"garbage"|"wall"|null)[][] — 색상 정보 포함
 *
 * 신규 모듈에서 채워진 칸은 모두 "garbage" (회색) 으로 표시.
 */
import { COLS, ROWS, type Cell, type Difficulty as OldDifficulty, type PieceKind, type Puzzle } from "../gameTypes";
import {
  generatePuzzle,
  type Board,
  type Difficulty as NewDifficulty,
  type PieceType,
} from "./tetrisSolver";

export function adaptBoard(board: Board): Cell[][] {
  return board.map((row) => row.map((c): Cell => (c === 1 ? "garbage" : null)));
}

export function adaptPieceType(p: PieceType): PieceKind {
  return p as PieceKind;  // I, O, T, S, Z, J, L — 동일 글자 (case-sensitive 둘 다 대문자)
}

export function adaptDifficulty(d: NewDifficulty): OldDifficulty {
  if (d === "easy") return "Easy";
  if (d === "normal") return "Normal";
  if (d === "hard") return "Hard";
  return "Challenge";
}

interface GenerateGameOptions {
  seed: number;
  difficulty?: NewDifficulty;
  targetLines?: number;
  maxAttempts?: number;
}

/**
 * 신규 tetrisSolver 로 퍼즐 생성 → 게임의 Puzzle 형식으로 변환.
 * generation 실패 (maxAttempts 초과) 시 null 반환 — 호출측이 폴백 처리.
 */
export function generateGamePuzzle(opts: GenerateGameOptions): Puzzle | null {
  const difficulty: NewDifficulty = opts.difficulty ?? "normal";
  const targetLines = opts.targetLines ?? (difficulty === "easy" ? 1 : difficulty === "normal" ? 2 : 3);
  const maxAttempts = opts.maxAttempts ?? 60;

  const generated = generatePuzzle({
    width: COLS,
    height: ROWS,
    difficulty,
    targetLines,
    maxAttempts,
  });
  if (!generated) return null;

  return {
    seed: opts.seed,
    template: "near-line",
    difficulty: adaptDifficulty(generated.mission.difficulty),
    grid: adaptBoard(generated.board),
    queue: generated.pieces.map(adaptPieceType),
    // perfect-clear 정체성 — 평가는 isEmpty. 신규 솔버는 라인 N개로 검증하지만,
    // (cells + 4q) % 10 === 0 인 보드면 라인 N = perfect-clear 동등.
    targetLines: 0,
    movesLimit: generated.pieces.length,
  };
}

// 테스트 환경에선 무거운 솔버 호출 스킵 (호출측이 폴백 처리)
const SKIP_IN_TEST =
  typeof process !== "undefined" &&
  process.env?.VITEST === "true" &&
  process.env?.VERIFY_SOLVER !== "1";

/**
 * 셔플용 — 신규 솔버는 라인 미션 기반이라 perfect-clear 보장 안 됨.
 * 통일된 정체성 (perfect-clear) 정착 전까지 비활성. 호출자는 자동으로
 * legacy `createFeedPuzzle` 폴백 (그쪽은 perfect-clear 큐 보장).
 *
 * 향후: tetrisSolver 를 perfect-clear 모드 (solver.ts:59 isEmpty) 로
 * 리팩토링 후 재활성.
 */
export function generateShufflePuzzle(_seed: number): Puzzle | null {
  if (SKIP_IN_TEST) return null;
  return null;
}
