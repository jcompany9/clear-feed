import { COLS, ROWS, type Cell, type Difficulty, type Piece, type PieceKind, type Puzzle } from "./gameTypes";
import { PIECES, absoluteCells, createPiece, rotatePiece } from "./pieces";
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

export function createFeedPuzzle(seed: number, challenge = false, fast = false): Puzzle {
  const rng = createRng(seed);

  // Challenge: random + 유일해 필터, 실패 시 Normal constructed 폴백.
  if (challenge) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const built = buildOnePuzzle(seed, true, rng);
      if (built.verified || SKIP_SOLVER_VERIFY) return built.puzzle;
    }
    return buildConstructedNormal(seed, rng);
  }

  // fast 모드 (initial feed) — random/chaos 스킵, 즉시 constructed 반환.
  // 95% random + 유일해 필터. 3 회 시도 — chaos grid 가 무거우므로 retries 줄임.
  if (!fast && !SKIP_SOLVER_VERIFY && rng.next() < 0.95) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const built = buildOnePuzzle(seed, false, rng);
      if (built.verified) return built.puzzle;
    }
  }

  // Constructed 폴백: Normal 위주
  const rolled = rng.next() < 0.35 ? "Easy" : "Normal";
  return rolled === "Easy" ? buildConstructedEasy(seed, rng) : buildConstructedNormal(seed, rng);
}

/**
 * Easy 패턴 시도 + perfect-clear 솔버 검증.
 * adjustQueueForMath 가 큐 길이를 강제 변경해서 패턴 디자인 풀이가 깨지는
 * 케이스 (예: seed 86786 — L 1개로 라인 3개 불가) 를 차단한다.
 * 다 실패 시 확정 풀이 가능한 안전 폴백 (warmup-i-gap).
 */
function buildConstructedEasy(seed: number, rng: Rng): Puzzle {
  // NOTE: random-dropped 시도 비활성 — 솔버 검증이 무거워 무한 로딩 유발.
  // 다음 이터: maxNodes/attempts 더 깎거나 비동기 워커로 옮김.
  const attempts = SKIP_SOLVER_VERIFY ? 1 : 12;
  for (let i = 0; i < attempts; i += 1) {
    const pattern = pickEasyPattern(rng);
    const { grid, queue } = pattern(rng);
    const adjusted = adjustQueueForMath(grid, queue, queue.length, rng);
    const candidate: Puzzle = {
      seed,
      template: "near-line",
      difficulty: "Easy",
      grid,
      queue: adjusted.queue,
      targetLines: 0,
      movesLimit: adjusted.queue.length,
    };
    if (SKIP_SOLVER_VERIFY) return candidate;
    if (solve(candidate, 30000).solvable) return candidate;
  }
  return safePerfectClearFallback(seed, "Easy");
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
  // NOTE: random-dropped 시도 비활성 — 무한 로딩 유발 (buildConstructedEasy 동일).
  const attempts = SKIP_SOLVER_VERIFY ? 1 : 12;
  for (let i = 0; i < attempts; i += 1) {
    const pattern = pickNormalPattern(rng);
    const { grid, queue } = pattern(rng);
    const adjusted = adjustQueueForMath(grid, queue, queue.length, rng);
    const candidate: Puzzle = {
      seed,
      template: "near-line",
      difficulty: "Normal",
      grid,
      queue: adjusted.queue,
      targetLines: 0,
      movesLimit: adjusted.queue.length,
    };
    if (SKIP_SOLVER_VERIFY) return candidate;
    if (solve(candidate, 30000).solvable) return candidate;
  }
  return safePerfectClearFallback(seed, "Normal");
}

/**
 * 확정 풀이 가능한 perfect-clear 폴백 — row 19 6칸 채움 + I 1개로 1라인.
 * 다른 모든 polback 이 unsolvable 일 때 사용자에게 풀 수 있는 퍼즐 보장.
 * 셀은 7종 PieceKind 중 random (단색 garbage 가 아닌 GBC 7색).
 */
function safePerfectClearFallback(seed: number, difficulty: Difficulty): Puzzle {
  const rng = createRng(seed);
  const grid: Cell[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => null as Cell),
  );
  // row 19: ###....### (3+4+3) → I-piece 가로로 가운데 4칸 채우면 1라인 클리어 → 0 블록
  const fill: Cell[] = [
    randomBlock(rng), randomBlock(rng), randomBlock(rng), null, null, null, null,
    randomBlock(rng), randomBlock(rng), randomBlock(rng),
  ];
  grid[ROWS - 1] = fill;
  return {
    seed,
    template: "near-line",
    difficulty,
    grid,
    queue: ["I"],
    targetLines: 0,
    movesLimit: 1,
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
  // 다양한 grid builder 무작위 선택 — 매 퍼즐마다 시각적 구조가 다름
  const builder = pickGridBuilder(rng);
  const grid = builder(rng, template, intendedTarget, initialDifficulty, queue[0]);

  const adjusted = adjustQueueForMath(grid, queue, movesLimit, rng);

  // perfect-clear 정체성 — 평가는 isEmpty. 솔버 검증도 perfect-clear 모드 (targetLines=0).
  // 솔버: target===0 이면 큐 다 써서 보드 비워야 solvable.
  // adjustQueueForMath 가 (cells + 4q) % 10 === 0 보장하므로 perfect-clear 후보 존재.
  let verified = SKIP_SOLVER_VERIFY;
  let finalQueue = adjusted.queue;
  let difficulty: Difficulty = initialDifficulty;

  if (!SKIP_SOLVER_VERIFY) {
    const solvableQueue = ensureSolvable(grid, adjusted.queue, adjusted.length, 0, rng);
    if (solvableQueue) {
      // 엄격 필터: solutionCount ≤ 2 만 통과. 3+ = 너그러운 퍼즐 거부.
      const probe: Puzzle = {
        seed: 0, template: "near-line", difficulty: initialDifficulty,
        grid, queue: solvableQueue, targetLines: 0, movesLimit: solvableQueue.length,
      };
      const analysis = analyze(probe, 3, 6000);  // cap=3 (3+ 찾으면 reject)
      if (!analysis.truncated && analysis.solutionCount > 0 && !analysis.capped) {
        finalQueue = solvableQueue;
        verified = true;
        difficulty = analysis.solutionCount === 1 ? "Challenge" : "Normal";
      }
    }
  }

  return {
    puzzle: {
      seed,
      template,
      difficulty,
      grid,
      queue: finalQueue,
      targetLines: 0,
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
  // Budget ↑ — chaos grid 검증에 더 많은 노드 필요. Worker pool 이 비용 흡수.
  if (solve(probe, 50000).solvable) return queue;
  const found = findSolvableQueue(grid, length, 12, () => rng.next(), 50000, targetLines);
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
  // fast=true → constructed only, 즉시 반환. Worker pool 이 chaos 퍼즐을 백그라운드로 채움.
  return Array.from({ length: count }, (_, index) => createFeedPuzzle(seed + index * 101, false, true));
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

type GridBuilder = (
  rng: Rng,
  template: TemplateName,
  targetLines: number,
  difficulty: Difficulty,
  opener: PieceKind,
) => Cell[][];

/**
 * 무작위 grid builder 선택 — 매 퍼즐마다 시각적 구조가 달라지도록.
 * Default = 기존 buildGrid (density 그라데이션 + pillars)
 * MultiRegion = 좌/우 두 영역, 가운데 빈 컬럼 (두 영역 따로 사고)
 * TallWell = 깊은 1-셀 우물, I 수직 강제
 * MixedGapWidths = 행마다 다른 gap 너비 (피스 종류 자연스레 다양)
 */
function pickGridBuilder(rng: Rng): GridBuilder {
  const r = rng.next();
  if (r < 0.5) return buildGridChaos;             // 50% — 카오스 (모든 feature 동시)
  if (r < 0.7) return buildGridMultiRegion;       // 20% — 좌/우 분리
  if (r < 0.85) return buildGridMixedGapWidths;   // 15% — 행별 gap 변화
  if (r < 0.95) return buildGridTallWell;         // 10% — 깊은 우물
  return buildGrid;                                // 5% — 기본
}

/**
 * CHAOS — 모든 feature 동시 적용. 시각적으로 압도적.
 * 12행 빽빽 density + 1-2 우물 + 4-6 pillars + 가운데 통로 (확률).
 * 솔버는 이 카오스에서 풀이 가능한 큐를 찾아냄 (또는 거부 → 재시도).
 */
function buildGridChaos(rng: Rng, template: TemplateName, targetLines: number, difficulty: Difficulty, opener: PieceKind): Cell[][] {
  const grid = emptyGrid();
  const startRow = difficulty === "Easy" ? 10 : difficulty === "Normal" ? 9 : 8;
  // 빽빽한 density (위→아래 그라데이션)
  for (let y = startRow; y < 20; y += 1) {
    const t = (y - startRow) / Math.max(1, 19 - startRow);
    const density = 0.45 + 0.35 * t;  // 0.45 → 0.8
    for (let x = 0; x < COLS; x += 1) {
      grid[y][x] = rng.next() < density ? randomBlock(rng) : null;
    }
  }
  // 1-2 우물 (수직 빈 칸)
  const numWells = rng.int(1, 2);
  for (let i = 0; i < numWells; i += 1) {
    const wellCol = rng.int(0, COLS - 1);
    const wellTop = rng.int(startRow, 15);
    for (let y = wellTop; y < 20; y += 1) {
      grid[y][wellCol] = null;
    }
  }
  // 3-5 pillars (수직 추가 셀)
  const numPillars = rng.int(3, 5);
  for (let i = 0; i < numPillars; i += 1) {
    const px = rng.int(0, COLS - 1);
    const pTop = rng.int(startRow, 14);
    const pHeight = rng.int(2, 4);
    for (let py = pTop; py < pTop + pHeight && py < 20; py += 1) {
      grid[py][px] = randomBlock(rng);
    }
  }
  // 30% 확률로 가운데 통로 (multi-region 효과)
  if (rng.next() < 0.3) {
    const middleCol = rng.int(3, 6);
    for (let y = startRow; y < 20; y += 1) {
      grid[y][middleCol] = null;
    }
  }
  void template; void targetLines; void opener;
  return grid;
}

/** 좌/우 두 영역 + 가운데 빈 통로 — 각 영역이 따로 클리어돼야 함 */
function buildGridMultiRegion(rng: Rng, template: TemplateName, targetLines: number, difficulty: Difficulty, opener: PieceKind): Cell[][] {
  const grid = emptyGrid();
  const baseRows = difficulty === "Easy" ? 6 : difficulty === "Normal" ? 8 : 10;
  const start = 20 - baseRows;
  // 가운데 통로: 2-3 컬럼 폭 빈 공간 (피스가 양쪽 영역으로 떨어질 수 있게)
  const middleStart = rng.int(3, 5);
  const middleEnd = middleStart + rng.int(1, 2);  // 통로 폭 2-3
  const density = difficulty === "Easy" ? 0.55 : difficulty === "Normal" ? 0.7 : 0.8;

  for (let y = start; y < 20; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (x >= middleStart && x <= middleEnd) continue;  // 가운데 통로 비움
      if (rng.next() < density) grid[y][x] = randomBlock(rng);
    }
  }
  // 바닥 행은 거의 다 채움 (라인 클리어 setup)
  for (let x = 0; x < COLS; x += 1) {
    if (x >= middleStart && x <= middleEnd) continue;
    grid[19][x] = randomBlock(rng);
  }
  cleanTopPressure(grid);
  void template; void targetLines; void opener;
  return grid;
}

/** 깊은 1-셀 우물 — I 수직(rot 1) 회전으로만 클리어 가능. 주변은 거의 꽉 참. */
function buildGridTallWell(rng: Rng, template: TemplateName, targetLines: number, difficulty: Difficulty, opener: PieceKind): Cell[][] {
  const grid = emptyGrid();
  const wellDepth = difficulty === "Easy" ? rng.int(3, 4) : difficulty === "Normal" ? rng.int(4, 5) : rng.int(5, 6);
  const wellCol = rng.int(0, COLS - 1);
  const start = 20 - wellDepth;

  for (let y = start; y < 20; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (x === wellCol) continue;  // 우물 col 비움
      grid[y][x] = randomBlock(rng);
    }
  }
  cleanTopPressure(grid);
  void template; void targetLines; void opener;
  return grid;
}

/** 행마다 다른 gap 너비 — row 19 = 4-gap, row 18 = 3-gap, row 17 = 2-gap 등 혼재 */
function buildGridMixedGapWidths(rng: Rng, template: TemplateName, targetLines: number, difficulty: Difficulty, opener: PieceKind): Cell[][] {
  const grid = emptyGrid();
  const numRows = difficulty === "Easy" ? rng.int(3, 4) : difficulty === "Normal" ? rng.int(4, 5) : rng.int(5, 6);
  const widths = [2, 3, 4];

  for (let r = 0; r < numRows; r += 1) {
    const y = 19 - r;
    const width = widths[rng.int(0, widths.length - 1)];
    const gapStart = rng.int(0, COLS - width);
    for (let x = 0; x < COLS; x += 1) {
      if (x >= gapStart && x < gapStart + width) continue;
      grid[y][x] = randomBlock(rng);
    }
  }
  cleanTopPressure(grid);
  void template; void targetLines; void opener;
  return grid;
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

/**
 * 랜덤 테트로미노 떨어뜨려 보드 생성 + 솔버로 perfect-clear 큐 검색.
 * EasyPattern (직선 행) 보다 자연스럽고 복잡한 보드 모양.
 *
 * 흐름: 빈 보드 → 5~9개 무작위 피스 (kind, rotation, col) drop →
 *      매번 라인 클리어 → 셀 수에 맞는 큐 길이 후보로 솔버 호출.
 * 풀이 가능한 큐 발견 시 puzzle 반환, 아니면 null (호출자 폴백).
 */
export function buildRandomDroppedBoardPuzzle(seed: number): Puzzle | null {
  const rng = createRng(seed);
  const grid = emptyGrid();

  const dropCount = rng.int(6, 10);
  for (let i = 0; i < dropCount; i += 1) {
    const kind = rng.pick(PIECES);
    const rotation = rng.int(0, 3);
    const col = rng.int(0, COLS - 1);
    dropPieceToBoard(grid, kind, rotation, col);
    clearFullLines(grid);
  }

  const cells = countNonWallCells(grid);
  if (cells === 0) return null;  // 다 클리어됨 → 빈 보드, 의미 없음

  // (cells + 4q) % 10 === 0 만족하는 q 후보 (1~10)
  const lengths: number[] = [];
  for (let q = 1; q <= 10; q += 1) {
    if ((cells + q * 4) % 10 === 0) lengths.push(q);
  }
  if (lengths.length === 0) return null;

  for (const q of lengths) {
    const found = findSolvableQueue(grid, q, 30, () => rng.next(), 50000, 0);
    if (found) {
      return {
        seed,
        template: "near-line",
        difficulty: "Normal",
        grid,
        queue: found.queue,
        targetLines: 0,
        movesLimit: found.queue.length,
      };
    }
  }
  return null;
}

/** 빈 grid 에 piece 를 col 위치로 떨어뜨려 garbage 셀로 잠금. 못 두면 무시.
 *  col 은 회전된 piece 의 가로 범위에 맞춰 클램프 (boundary 벗어남 방지). */
function dropPieceToBoard(grid: Cell[][], kind: PieceKind, rotation: number, col: number): void {
  let piece: Piece = createPiece(kind);
  for (let r = 0; r < rotation % 4; r += 1) piece = rotatePiece(piece);
  const minRelX = Math.min(...piece.cells.map((c) => c.x));
  const maxRelX = Math.max(...piece.cells.map((c) => c.x));
  const minRelY = Math.min(...piece.cells.map((c) => c.y));
  const safeCol = Math.max(-minRelX, Math.min(COLS - 1 - maxRelX, col));
  piece = { ...piece, x: safeCol, y: -minRelY };  // 가장 위 셀이 y=0 에 위치
  if (!canPlacePiece(grid, piece)) return;
  while (canPlacePiece(grid, { ...piece, y: piece.y + 1 })) {
    piece = { ...piece, y: piece.y + 1 };
  }
  // 셀 색을 piece 종류 (PieceKind) 자체로 — 7종 GBC 색이 보드에 자연스럽게 박힘
  for (const c of absoluteCells(piece)) {
    if (c.y >= 0 && c.y < ROWS && c.x >= 0 && c.x < COLS) grid[c.y][c.x] = kind;
  }
}

function canPlacePiece(grid: Cell[][], piece: Piece): boolean {
  for (const c of absoluteCells(piece)) {
    if (c.x < 0 || c.x >= COLS || c.y < 0 || c.y >= ROWS) return false;
    if (grid[c.y][c.x] !== null) return false;
  }
  return true;
}

function clearFullLines(grid: Cell[][]): void {
  const fullRows: number[] = [];
  for (let y = 0; y < ROWS; y += 1) {
    if (grid[y].every((c) => c !== null)) fullRows.push(y);
  }
  if (fullRows.length === 0) return;
  const kept = grid.filter((_, y) => !fullRows.includes(y));
  while (kept.length < ROWS) kept.unshift(Array.from({ length: COLS }, () => null as Cell));
  for (let y = 0; y < ROWS; y += 1) grid[y] = kept[y];
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
