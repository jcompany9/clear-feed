import { COLS, type Cell, type Difficulty, type PieceKind, type Puzzle } from "./gameTypes";
import { PIECES } from "./pieces";

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
  const difficulty = chooseDifficulty(rng, challenge);
  const template = chooseTemplate(rng);
  const targetLines = difficulty === "Easy" ? rng.pick([1, 1, 2]) : difficulty === "Normal" ? rng.pick([1, 2, 2, 3]) : rng.pick([2, 3]);
  const movesLimit = difficulty === "Easy" ? targetLines + 4 : difficulty === "Normal" ? targetLines + 3 : targetLines + 2;
  const queue = buildQueue(rng, template, targetLines, movesLimit, difficulty);
  const grid = buildGrid(rng, template, targetLines, difficulty, queue[0]);

  return {
    seed,
    template,
    difficulty,
    grid,
    queue,
    targetLines,
    movesLimit,
  };
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

function buildQueue(rng: Rng, template: TemplateName, targetLines: number, movesLimit: number, difficulty: Difficulty): PieceKind[] {
  const opener: Record<TemplateName, PieceKind[]> = {
    "near-line": ["I", "O", "L"],
    "center-slot": ["I", "T", "O"],
    stairs: ["T", "S", "Z"],
    "side-weight": ["L", "J", "I"],
    repair: ["T", "L", "J"],
  };
  const queue: PieceKind[] = [rng.pick(opener[template])];
  const pool = difficulty === "Challenge" ? PIECES : PIECES.filter((piece) => piece !== "I" || rng.next() > 0.25);
  while (queue.length < movesLimit) {
    const piece = rng.pick(pool);
    if (queue.length < targetLines && piece === queue[queue.length - 1]) continue;
    queue.push(piece);
  }
  return queue;
}

function buildGrid(rng: Rng, template: TemplateName, targetLines: number, difficulty: Difficulty, opener: PieceKind): Cell[][] {
  const grid = emptyGrid();
  const baseRows = difficulty === "Easy" ? 5 : difficulty === "Normal" ? 7 : 9;
  const start = 20 - baseRows;

  for (let y = start; y < 20; y += 1) {
    const density = difficulty === "Easy" ? 0.58 : difficulty === "Normal" ? 0.66 : 0.72;
    for (let x = 0; x < COLS; x += 1) {
      grid[y][x] = rng.next() < density ? randomBlock(rng) : null;
    }
  }

  carveByTemplate(grid, template, opener);
  makeTargetRows(grid, rng, targetLines, template, opener);
  cleanTopPressure(grid);
  addCeiling(grid, rng, difficulty);
  return grid;
}

function addCeiling(grid: Cell[][], rng: Rng, difficulty: Difficulty): void {
  const wallProbability = difficulty === "Easy" ? 0.45 : difficulty === "Normal" ? 0.55 : 0.65;
  const minGapWidth = 3; // 피스가 통과할 수 있도록 최소 3칸 연속 빈 공간 보장
  const ceilingRow = 0;
  const cells: Cell[] = Array.from({ length: COLS }, () =>
    rng.next() < wallProbability ? "wall" : null,
  );
  ensureGap(cells, minGapWidth, rng);
  grid[ceilingRow] = cells;
}

function ensureGap(cells: Cell[], minWidth: number, rng: Rng): void {
  const hasGap = (arr: Cell[]): boolean => {
    let run = 0;
    for (const c of arr) {
      if (c === null) {
        run += 1;
        if (run >= minWidth) return true;
      } else {
        run = 0;
      }
    }
    return false;
  };
  if (hasGap(cells)) return;
  // 강제로 한 구간을 비움
  const start = rng.int(0, COLS - minWidth);
  for (let i = 0; i < minWidth; i += 1) {
    cells[start + i] = null;
  }
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
