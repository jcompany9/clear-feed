import { COLS, ROWS, type Cell, type Difficulty, type PieceKind, type Puzzle } from "./gameTypes";
import { PIECES } from "./pieces";
import { analyze, findSolvableQueue, solve } from "./solver";

type TemplateName = "near-line" | "center-slot" | "stairs" | "side-weight" | "repair";

interface Rng {
  next: () => number;
  int: (min: number, max: number) => number;
  pick: <T>(items: T[]) => T;
}

const templates: TemplateName[] = ["near-line", "center-slot", "stairs", "side-weight", "repair"];
let lastTemplate: TemplateName | null = null;
let lastDifficulty: Difficulty | null = null;
let difficultyRun = 0;

export function createFeedPuzzle(seed: number, challenge = false): Puzzle {
  const rng = createRng(seed);

  // Challenge: random + 유일해 필터, 실패 시 Normal constructed 폴백.
  if (challenge) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const built = buildOnePuzzle(seed, true, rng);
      if (built.verified || SKIP_SOLVER_VERIFY) return built.puzzle;
    }
    return buildConstructedNormal(seed, rng);
  }

  // 90% random + 유일해 필터. 2 회 시도 (gen time < 1s 목표).
  if (!SKIP_SOLVER_VERIFY && rng.next() < 0.9) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const built = buildOnePuzzle(seed, false, rng);
      if (built.verified) return built.puzzle;
    }
  }

  // Constructed 폴백: Normal 위주
  const rolled = rng.next() < 0.35 ? "Easy" : "Normal";
  return rolled === "Easy" ? buildConstructedEasy(seed, rng) : buildConstructedNormal(seed, rng);
}

/**
 * 다양한 Easy 패턴 — 모든 패턴이 디자인으로 풀이 보장.
 * 솔버 검증 불필요 → 즉시 생성 (< 1ms).
 */
function buildConstructedEasy(seed: number, rng: Rng): Puzzle {
  const pattern = pickEasyPattern(rng);
  const { grid, queue, targetLines } = pattern(rng);
  return {
    seed,
    template: "near-line",
    difficulty: "Easy",
    grid,
    queue,
    targetLines,
    movesLimit: queue.length,
  };
}

type EasyPattern = (rng: Rng) => { grid: Cell[][]; queue: PieceKind[]; targetLines: number };

function pickEasyPattern(rng: Rng): EasyPattern {
  // 3~4 piece 만 — 사고 깊이 강제
  const patterns: Array<{ p: EasyPattern; weight: number }> = [
    { p: easy4Row3GapLOIO,  weight: 30 },  // [L, O, I, O] 4 라인, 4 단계 사고
    { p: easy4Row3GapJOIO,  weight: 30 },  // [J, O, I, O] 미러
    { p: easy3Row3GapLOI,   weight: 18 },  // [L, O, I] 3 가지 회전
    { p: easy3Row3GapJOI,   weight: 18 },  // [J, O, I] 미러
    { p: easyTripleVaried,  weight: 4 },   // [I, I, I] 컬럼 이동 (단순)
  ];
  const total = patterns.reduce((s, x) => s + x.weight, 0);
  let pick = rng.next() * total;
  for (const { p, weight } of patterns) {
    pick -= weight;
    if (pick < 0) return p;
  }
  return patterns[0].p;
}

function fillRowExceptGap(grid: Cell[][], y: number, gapStart: number, gapWidth: number, rng: Rng): void {
  for (let x = 0; x < COLS; x += 1) {
    if (x < gapStart || x >= gapStart + gapWidth) grid[y][x] = randomBlock(rng);
  }
}

/** Aligned gap 패턴 위에 안전한 장식 셀 추가 — gap col 을 피해 1~2 개 tower 를 위쪽에 배치.
 *  pieces 가 gap 으로 떨어질 때 방해되지 않음. */
function decorateAboveAligned(grid: Cell[][], gapStart: number, gapWidth: number, rng: Rng): void {
  const gapCols = new Set<number>();
  for (let i = 0; i < gapWidth; i += 1) gapCols.add(gapStart + i);
  const numTowers = rng.int(1, 2);
  for (let i = 0; i < numTowers; i += 1) {
    let col = rng.int(0, COLS - 1);
    let attempts = 0;
    while (gapCols.has(col) && attempts < 8) { col = rng.int(0, COLS - 1); attempts += 1; }
    if (gapCols.has(col)) continue;
    const height = rng.int(1, 3);
    const top = rng.int(13, 16);
    for (let h = 0; h < height && top + h < 17; h += 1) {
      grid[top + h][col] = randomBlock(rng);
    }
  }
}

/** 3-row 4-gap, 각 행마다 다른 컬럼 → 3 라인 (컬럼 이동 학습) */
const easyTripleVaried: EasyPattern = (rng) => {
  const grid = emptyGrid();
  for (let r = 0; r < 3; r += 1) {
    const gap = rng.int(0, COLS - 4);
    fillRowExceptGap(grid, ROWS - 1 - r, gap, 4, rng);
  }
  return { grid, queue: ["I", "I", "I"], targetLines: 3 };
};

/** 3-row 3-gap 정렬 + [L, O, I] — L 회전 / O 좌우 / I 수직 — 3 가지 다른 피스 */
const easy3Row3GapLOI: EasyPattern = (rng) => {
  const grid = emptyGrid();
  const gap = rng.int(0, COLS - 3);
  for (let r = 0; r < 3; r += 1) {
    fillRowExceptGap(grid, ROWS - 1 - r, gap, 3, rng);
  }
  decorateAboveAligned(grid, gap, 3, rng);
  return { grid, queue: ["L", "O", "I"], targetLines: 3 };
};

/** 3-row 3-gap 정렬 + [J, O, I] — J 회전 / O / I 수직 — 미러 변형 */
const easy3Row3GapJOI: EasyPattern = (rng) => {
  const grid = emptyGrid();
  const gap = rng.int(0, COLS - 3);
  for (let r = 0; r < 3; r += 1) {
    fillRowExceptGap(grid, ROWS - 1 - r, gap, 3, rng);
  }
  decorateAboveAligned(grid, gap, 3, rng);
  return { grid, queue: ["J", "O", "I"], targetLines: 3 };
};

/** 4-row 3-gap 정렬 + [L, O, I, O] — 4 단계 사고:
 *  L 회전 → O → I 수직 → O.
 *  4 라인 클리어, 각 단계마다 다른 회전/위치 필요. */
const easy4Row3GapLOIO: EasyPattern = (rng) => {
  const grid = emptyGrid();
  const gap = rng.int(0, COLS - 3);
  for (let r = 0; r < 4; r += 1) {
    fillRowExceptGap(grid, ROWS - 1 - r, gap, 3, rng);
  }
  decorateAboveAligned(grid, gap, 3, rng);
  return { grid, queue: ["L", "O", "I", "O"], targetLines: 4 };
};

/** 4-row 3-gap 정렬 + [J, O, I, O] — 미러. */
const easy4Row3GapJOIO: EasyPattern = (rng) => {
  const grid = emptyGrid();
  const gap = rng.int(0, COLS - 3);
  for (let r = 0; r < 4; r += 1) {
    fillRowExceptGap(grid, ROWS - 1 - r, gap, 3, rng);
  }
  decorateAboveAligned(grid, gap, 3, rng);
  return { grid, queue: ["J", "O", "I", "O"], targetLines: 4 };
};


/**
 * Normal 모드: 3 피스 큐, 2~3 라인 클리어 — 더 깊은 계획 필요.
 */
function buildConstructedNormal(seed: number, rng: Rng): Puzzle {
  const pattern = pickNormalPattern(rng);
  const { grid, queue, targetLines } = pattern(rng);
  return {
    seed,
    template: "near-line",
    difficulty: "Normal",
    grid,
    queue,
    targetLines,
    movesLimit: queue.length,
  };
}

function pickNormalPattern(rng: Rng): EasyPattern {
  // Normal = 다양한 피스 위주 (I-only 가중치 ↓↓)
  const patterns: Array<{ p: EasyPattern; weight: number }> = [
    // 혼합 피스 (총 75)
    { p: normalLJTAlternating,   weight: 30 },  // [L/T/J] mixed 3 라인
    { p: easy3Row3GapLOI,        weight: 22 },  // [L, O, I] 3 가지 다른 피스
    { p: easy3Row3GapJOI,        weight: 22 },  // [J, O, I] mirror
    // 단일/I-only (총 25)
    { p: normalTripleMixed,      weight: 7 },   // [I,I,I] 좌우
    { p: normalQuad4Gap,         weight: 6 },   // [I,I,I,I] TETRIS
    { p: normalQuad2GapO,        weight: 6 },   // [O,O]
    { p: normalQuintAligned,     weight: 6 },   // [I,I,I,I,I]
  ];
  const total = patterns.reduce((s, x) => s + x.weight, 0);
  let pick = rng.next() * total;
  for (const { p, weight } of patterns) {
    pick -= weight;
    if (pick < 0) return p;
  }
  return patterns[0].p;
}

const normalTripleMixed: EasyPattern = (rng) => {
  const grid = emptyGrid();
  // 3-row, 각 행 좌/우 영역 번갈아 — 컬럼 이동 강제
  const gapL = rng.int(0, 2);              // 왼쪽 영역
  const gapR = rng.int(0, 2) + COLS - 6;   // 오른쪽 영역
  fillRowExceptGap(grid, ROWS - 1, gapL, 4, rng);
  fillRowExceptGap(grid, ROWS - 2, gapR, 4, rng);
  fillRowExceptGap(grid, ROWS - 3, gapL, 4, rng);
  return { grid, queue: ["I", "I", "I"], targetLines: 3 };
};

const normalQuad2GapO: EasyPattern = (rng) => {
  const grid = emptyGrid();
  // 4-row 2-gap 정렬 → O 두 개 (각 O 가 2 라인 동시 클리어 = 4 라인)
  const gap = rng.int(0, COLS - 2);
  for (let r = 0; r < 4; r += 1) {
    fillRowExceptGap(grid, ROWS - 1 - r, gap, 2, rng);
  }
  decorateAboveAligned(grid, gap, 2, rng);
  return { grid, queue: ["O", "O"], targetLines: 4 };
};

/** 4-row 4-gap 정렬 + I×4 → 4 lines 클리어 (반복 동일 액션이지만 여러 수 계획) */
const normalQuad4Gap: EasyPattern = (rng) => {
  const grid = emptyGrid();
  const gap = rng.int(0, COLS - 4);
  for (let r = 0; r < 4; r += 1) {
    fillRowExceptGap(grid, ROWS - 1 - r, gap, 4, rng);
  }
  decorateAboveAligned(grid, gap, 4, rng);
  return { grid, queue: ["I", "I", "I", "I"], targetLines: 4 };
};

/** 3-row 3-gap 정렬 + L,T,J 혼합 (연속 중복 방지 → 매번 다른 피스) */
const normalLJTAlternating: EasyPattern = (rng) => {
  const grid = emptyGrid();
  const gap = rng.int(0, COLS - 3);
  for (let r = 0; r < 3; r += 1) {
    fillRowExceptGap(grid, ROWS - 1 - r, gap, 3, rng);
  }
  decorateAboveAligned(grid, gap, 3, rng);
  const pool: PieceKind[] = ["L", "T", "J"];
  const queue: PieceKind[] = [];
  for (let i = 0; i < 3; i += 1) {
    let p = pool[rng.int(0, pool.length - 1)];
    while (i > 0 && p === queue[i - 1]) p = pool[rng.int(0, pool.length - 1)];
    queue.push(p);
  }
  return { grid, queue, targetLines: 3 };
};

/** 5-row 4-gap 정렬 + I×5 → 5 lines 클리어 */
const normalQuintAligned: EasyPattern = (rng) => {
  const grid = emptyGrid();
  const gap = rng.int(0, COLS - 4);
  for (let r = 0; r < 5; r += 1) {
    fillRowExceptGap(grid, ROWS - 1 - r, gap, 4, rng);
  }
  decorateAboveAligned(grid, gap, 4, rng);
  return { grid, queue: ["I", "I", "I", "I", "I"], targetLines: 5 };
};

function buildOnePuzzle(seed: number, challenge: boolean, rng: Rng): { puzzle: Puzzle; verified: boolean } {
  const initialDifficulty = chooseDifficulty(rng, challenge);
  const template = chooseTemplate(rng);
  const intendedTarget = initialDifficulty === "Easy" ? 1 : initialDifficulty === "Normal" ? rng.pick([1, 2, 2, 3]) : rng.pick([2, 3]);
  const movesLimit = initialDifficulty === "Easy" ? intendedTarget + 3 : initialDifficulty === "Normal" ? intendedTarget + 3 : intendedTarget + 2;
  const queue = buildQueue(rng, template, intendedTarget, movesLimit, initialDifficulty);
  const grid = buildGrid(rng, template, intendedTarget, initialDifficulty, queue[0]);

  const adjusted = adjustQueueForMath(grid, queue, movesLimit, rng);

  const cellCount = countNonWallCells(grid);
  const totalCells = cellCount + adjusted.length * 4;
  const targetLines = totalCells > 0 && totalCells % 10 === 0 ? totalCells / 10 : intendedTarget;

  let verified = SKIP_SOLVER_VERIFY;
  let finalQueue = adjusted.queue;
  let difficulty: Difficulty = initialDifficulty;

  if (!SKIP_SOLVER_VERIFY) {
    const solvableQueue = ensureSolvable(grid, adjusted.queue, adjusted.length, targetLines, rng);
    if (solvableQueue) {
      // 유일해 필터: solutionCount > 3 면 거부 (퍼즐답지 않은 너그러운 퍼즐)
      // 1~3 경로만 통과 → 진짜 사고 필요
      const probe: Puzzle = {
        seed: 0, template: "near-line", difficulty: initialDifficulty,
        grid, queue: solvableQueue, targetLines, movesLimit: solvableQueue.length,
      };
      const analysis = analyze(probe, 4, 6000);  // cap=4 (4개 찾으면 reject)
      if (!analysis.truncated && analysis.solutionCount > 0 && !analysis.capped) {
        // 합격: solutionCount in [1, 3]
        finalQueue = solvableQueue;
        verified = true;
        // 난이도: 1 solution = Challenge, 2 = Normal, 3 = Easy
        difficulty = analysis.solutionCount === 1 ? "Challenge"
          : analysis.solutionCount === 2 ? "Normal"
          : "Easy";
      }
      // capped (4+ solutions): 거부 → verified false → 호출측 재시도
    }
  }

  return {
    puzzle: {
      seed,
      template,
      difficulty,
      grid,
      queue: finalQueue,
      targetLines,
      movesLimit: finalQueue.length,
    },
    verified,
  };
}

const SKIP_SOLVER_VERIFY =
  typeof process !== "undefined" &&
  process.env?.VITEST === "true" &&
  process.env?.VERIFY_SOLVER !== "1";

/**
 * 큐가 실제로 풀리는지 검증, 안 풀리면 풀이 가능한 큐를 탐색.
 * 결과: 검증된 큐. 못 찾으면 null (호출측이 grid 자체를 재생성하도록 신호).
 *
 * Budget: 25K nodes 1차 + 50K × 20 attempts 2차 — 평균 50~300ms, 최악 ~3s.
 */
function ensureSolvable(
  grid: Cell[][],
  queue: PieceKind[],
  length: number,
  targetLines: number,
  rng: Rng,
): PieceKind[] | null {
  const probe: Puzzle = {
    seed: 0,
    template: "near-line",
    difficulty: "Easy",
    grid,
    queue,
    targetLines,
    movesLimit: length,
  };
  // 예산: 평균 gen ~300ms 목표.
  if (solve(probe, 18000).solvable) return queue;
  const found = findSolvableQueue(grid, length, 8, () => rng.next(), 20000, targetLines);
  return found ? found.queue : null;
}

function adjustQueueForMath(grid: Cell[][], queue: PieceKind[], originalLimit: number, rng: Rng): { queue: PieceKind[]; length: number } {
  // 셀 수가 홀수면 무작위 셀 1개 제거해서 짝수로 (4q는 항상 짝수라 홀수에선 절대 10 배수 못 만듦)
  let cellCount = countNonWallCells(grid);
  if (cellCount % 2 === 1) {
    const filled: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < grid.length; y += 1) {
      for (let x = 0; x < grid[y].length; x += 1) {
        const v = grid[y][x];
        if (v !== null && v !== "wall") filled.push({ x, y });
      }
    }
    if (filled.length > 0) {
      const pick = filled[rng.int(0, filled.length - 1)];
      grid[pick.y][pick.x] = null;
      cellCount -= 1;
    }
  }

  // (cells + 4q) % 10 === 0 만족하는 q 후보 (1~10 범위)
  const candidates: number[] = [];
  for (let q = 1; q <= 10; q += 1) {
    if ((cellCount + q * 4) % 10 === 0) candidates.push(q);
  }
  if (candidates.length === 0) {
    // 안전장치 — 짝수 보정 후엔 거의 도달 불가 (cells가 0인 경우 등)
    return { queue, length: originalLimit };
  }
  // 원래 movesLimit과 가장 가까운 후보 선택 (사용자 체감 난이도 유지)
  let best = candidates[0];
  for (const c of candidates) {
    if (Math.abs(c - originalLimit) < Math.abs(best - originalLimit)) best = c;
  }
  // 큐 길이를 best로 맞춤 (자르거나 늘림)
  const adjusted = [...queue];
  if (adjusted.length > best) {
    adjusted.length = best;
  } else {
    while (adjusted.length < best) adjusted.push(rng.pick(PIECES));
  }
  return { queue: adjusted, length: best };
}

export function createInitialFeed(count: number, seed: number): Puzzle[] {
  return Array.from({ length: count }, (_, index) => createFeedPuzzle(seed + index * 101));
}

function chooseDifficulty(rng: Rng, challenge: boolean): Difficulty {
  if (challenge) return "Challenge";
  const rolled: Difficulty = rng.next() < 0.8 ? "Easy" : "Normal";
  if (rolled === lastDifficulty) {
    difficultyRun += 1;
  } else {
    difficultyRun = 0;
  }
  lastDifficulty = difficultyRun > 3 ? "Normal" : rolled;
  return lastDifficulty;
}

function chooseTemplate(rng: Rng): TemplateName {
  const choices = templates.filter((template) => template !== lastTemplate);
  const template = rng.pick(choices);
  lastTemplate = template;
  return template;
}

function buildQueue(rng: Rng, template: TemplateName, _targetLines: number, movesLimit: number, difficulty: Difficulty): PieceKind[] {
  const opener: Record<TemplateName, PieceKind[]> = {
    "near-line": ["I", "O", "L"],
    "center-slot": ["I", "T", "O"],
    stairs: ["T", "S", "Z"],
    "side-weight": ["L", "J", "I"],
    repair: ["T", "L", "J"],
  };
  const queue: PieceKind[] = [rng.pick(opener[template])];
  const pool = difficulty === "Challenge" ? PIECES : PIECES.filter((piece) => piece !== "I" || rng.next() > 0.25);
  // 연속 중복 방지 — 큐 다양성 ↑
  while (queue.length < movesLimit) {
    const piece = rng.pick(pool);
    if (piece === queue[queue.length - 1]) continue;
    queue.push(piece);
  }
  return queue;
}

function buildGrid(rng: Rng, template: TemplateName, targetLines: number, difficulty: Difficulty, opener: PieceKind): Cell[][] {
  const grid = emptyGrid();
  const baseRows = difficulty === "Easy" ? 7 : difficulty === "Normal" ? 10 : 12;
  const start = 20 - baseRows;

  // Density 그라데이션 — 위쪽 sparse, 아래쪽 dense (더 빽빽하게)
  const minD = difficulty === "Easy" ? 0.2 : difficulty === "Normal" ? 0.3 : 0.4;
  const maxD = difficulty === "Easy" ? 0.65 : difficulty === "Normal" ? 0.75 : 0.85;
  for (let y = start; y < 20; y += 1) {
    const distFromTop = (y - start) / Math.max(1, baseRows - 1);  // 0 위, 1 아래
    const density = minD + (maxD - minD) * distFromTop;
    for (let x = 0; x < COLS; x += 1) {
      grid[y][x] = rng.next() < density ? randomBlock(rng) : null;
    }
  }

  // 무작위 pillar 1~2 개 추가 — 세로로 2~4 셀 쌓인 기둥 (수직 구조 강조)
  const numPillars = difficulty === "Easy" ? rng.int(0, 1) : rng.int(1, 2);
  for (let i = 0; i < numPillars; i += 1) {
    const px = rng.int(0, COLS - 1);
    const pHeight = rng.int(2, 4);
    const pTop = Math.max(start, 19 - pHeight - rng.int(0, 2));
    for (let py = pTop; py <= pTop + pHeight - 1 && py < 20; py += 1) {
      grid[py][px] = randomBlock(rng);
    }
  }

  carveByTemplate(grid, template, opener);
  makeTargetRows(grid, rng, targetLines, template, opener);
  cleanTopPressure(grid);
  return grid;
}

function makeTargetRows(grid: Cell[][], rng: Rng, targetLines: number, template: TemplateName, opener: PieceKind): void {
  const rows = [19, 18, 17].slice(0, targetLines);
  rows.forEach((row, index) => {
    for (let x = 0; x < COLS; x += 1) grid[row][x] = randomBlock(rng);
    const holes = holesFor(template, opener, index);
    holes.forEach((x) => {
      if (x >= 0 && x < COLS) grid[row][x] = null;
    });
  });
}

function holesFor(template: TemplateName, opener: PieceKind, offset: number): number[] {
  if (opener === "I") return template === "center-slot" ? [4, 5, 6, 7].map((x) => x - offset) : [3, 4, 5, 6];
  if (opener === "O") return [4, 5];
  if (opener === "T") return offset === 0 ? [4, 5, 6] : [5];
  if (opener === "L") return template === "side-weight" ? [7, 8, 9] : [5, 6, 7];
  if (opener === "J") return template === "side-weight" ? [0, 1, 2] : [2, 3, 4];
  if (opener === "S") return [4, 5, 6];
  return [3, 4, 5];
}

function carveByTemplate(grid: Cell[][], template: TemplateName, opener: PieceKind): void {
  switch (template) {
    case "center-slot":
      for (let y = 13; y < 20; y += 1) {
        grid[y][4] = null;
        grid[y][5] = null;
      }
      break;
    case "stairs":
      for (let step = 0; step < 5; step += 1) {
        for (let y = 19 - step; y < 20; y += 1) grid[y][step + 2] = null;
      }
      break;
    case "side-weight":
      for (let y = 12; y < 20; y += 1) {
        const x = opener === "J" ? 1 : 8;
        grid[y][x] = null;
      }
      break;
    case "repair":
      for (let y = 15; y < 19; y += 1) {
        grid[y][3] = null;
        grid[y][6] = null;
      }
      break;
    default:
      for (let y = 16; y < 20; y += 1) grid[y][5] = null;
  }
}

function cleanTopPressure(grid: Cell[][]): void {
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < COLS; x += 1) grid[y][x] = null;
  }
}

function countNonWallCells(grid: Cell[][]): number {
  let n = 0;
  for (const row of grid) for (const c of row) if (c !== null && c !== "wall") n += 1;
  return n;
}

function emptyGrid(): Cell[][] {
  return Array.from({ length: 20 }, () => Array.from({ length: COLS }, () => null));
}

function randomBlock(rng: Rng): Cell {
  return rng.pick(["I", "O", "T", "L", "J", "S", "Z"] as PieceKind[]);
}

function createRng(seed: number): Rng {
  let value = seed >>> 0;
  const next = () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
  return {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    pick: (items) => items[Math.floor(next() * items.length)],
  };
}
