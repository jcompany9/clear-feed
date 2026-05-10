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
    targetLines: generated.mission.targetLines,
    movesLimit: generated.pieces.length,
  };
}

// 테스트 환경에선 무거운 솔버 호출 스킵 (호출측이 폴백 처리)
const SKIP_IN_TEST =
  typeof process !== "undefined" &&
  process.env?.VITEST === "true" &&
  process.env?.VERIFY_SOLVER !== "1";

/**
 * 셔플용 — 매번 다른 난이도 시도 (Hard → Normal → Easy 순으로 폴백).
 */
export function generateShufflePuzzle(seed: number): Puzzle | null {
  if (SKIP_IN_TEST) return null;

  // 50% Normal, 30% Hard, 15% Challenge, 5% Easy 분포로 시도
  const roll = Math.random();
  let primary: NewDifficulty;
  if (roll < 0.5) primary = "normal";
  else if (roll < 0.8) primary = "hard";
  else if (roll < 0.95) primary = "challenge";
  else primary = "easy";

  const fallbackOrder: NewDifficulty[] = primary === "challenge"
    ? ["challenge", "hard", "normal", "easy"]
    : primary === "hard"
      ? ["hard", "normal", "easy"]
      : primary === "normal"
        ? ["normal", "easy"]
        : ["easy"];

  for (const d of fallbackOrder) {
    const result = generateGamePuzzle({ seed, difficulty: d, maxAttempts: 40 });
    if (result) return result;
  }
  return null;
}
