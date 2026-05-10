/**
 * tetrisSolver 사용 예제. 실제 빌드/UI 에는 import 되지 않음.
 *
 * 실행 (Node 또는 vite-node):
 *   npx tsx src/game/tetrisSolver.example.ts
 */
import {
  createEmptyBoard,
  generatePuzzle,
  solvePuzzle,
  type Board,
  type Mission,
  type PieceType,
} from "./tetrisSolver";

function runFixedExample(): void {
  const board: Board = createEmptyBoard(10, 20);
  board[19] = [1, 1, 1, 0, 0, 0, 0, 1, 1, 1];
  board[18] = [1, 1, 0, 0, 1, 1, 0, 0, 1, 1];
  board[17] = [1, 0, 0, 1, 1, 1, 1, 0, 0, 1];

  const pieces: PieceType[] = ["T", "L", "I", "O"];
  const mission: Mission = {
    targetLines: 2,
    exactClearLines: false,
    mustUseAllPieces: true,
    maxSolutions: 200,
    difficulty: "normal",
  };

  const result = solvePuzzle(board, pieces, mission);
  // eslint-disable-next-line no-console
  console.log("[fixed] solvable:", result.solvable);
  // eslint-disable-next-line no-console
  console.log("[fixed] solutionCount:", result.solutionCount);
  // eslint-disable-next-line no-console
  console.log("[fixed] difficulty:", result.stats.difficultyLabel);
  // eslint-disable-next-line no-console
  console.log("[fixed] stats:", result.stats);
}

function runGenerateExamples(): void {
  for (const difficulty of ["easy", "normal", "hard", "challenge"] as const) {
    const targetLines = difficulty === "easy" ? 1 : difficulty === "normal" ? 2 : 3;
    const t0 = Date.now();
    const generated = generatePuzzle({
      width: 10,
      height: 20,
      difficulty,
      targetLines,
      maxAttempts: 5000,
    });
    const dt = Date.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`[gen ${difficulty}] ${dt}ms — found:`, generated !== null);
    if (generated) {
      // eslint-disable-next-line no-console
      console.log(`  pieces:`, generated.pieces);
      // eslint-disable-next-line no-console
      console.log(`  solutionCount:`, generated.solutionCount);
      // eslint-disable-next-line no-console
      console.log(`  successfulFirstMoves:`, generated.stats.successfulFirstMoves);
      // eslint-disable-next-line no-console
      console.log(`  difficultyScore:`, generated.stats.difficultyScore);
    }
  }
}

runFixedExample();
runGenerateExamples();
