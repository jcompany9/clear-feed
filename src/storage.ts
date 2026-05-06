import type { Difficulty, Puzzle } from "./gameTypes";

const KEY = "clear-feed-mvp";

interface StoredPuzzle {
  seed: number;
  template: string;
  difficulty: Difficulty;
  cleared: boolean;
}

interface StoredState {
  recent: StoredPuzzle[];
  soundOn: boolean;
  lastSeed: number;
  clears: number;
  plays: number;
}

const fallback: StoredState = {
  recent: [],
  soundOn: true,
  lastSeed: Date.now() % 100000,
  clears: 0,
  plays: 0,
};

export function loadStorage(): StoredState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

export function saveStorage(state: StoredState): void {
  localStorage.setItem(KEY, JSON.stringify({ ...state, recent: state.recent.slice(0, 20) }));
}

export function rememberPuzzle(puzzle: Puzzle, cleared: boolean): void {
  const state = loadStorage();
  state.lastSeed = puzzle.seed;
  state.recent = [
    { seed: puzzle.seed, template: puzzle.template, difficulty: puzzle.difficulty, cleared },
    ...state.recent.filter((item) => item.seed !== puzzle.seed),
  ].slice(0, 20);
  if (cleared) state.clears += 1;
  state.plays += 1;
  saveStorage(state);
}

export function setSoundOn(soundOn: boolean): void {
  const state = loadStorage();
  state.soundOn = soundOn;
  saveStorage(state);
}
