export const COLS = 10;
export const ROWS = 20;

export type PieceKind = "I" | "O" | "T" | "L" | "J" | "S" | "Z";
export type Difficulty = "Easy" | "Normal" | "Challenge";
export type GameMode = "feed" | "playing" | "clear" | "failed";

export type Cell = PieceKind | "garbage" | null;

export interface Point {
  x: number;
  y: number;
}

export interface Piece {
  kind: PieceKind;
  cells: Point[];
  x: number;
  y: number;
}

export interface Puzzle {
  seed: number;
  template: string;
  difficulty: Difficulty;
  grid: Cell[][];
  queue: PieceKind[];
  targetLines: number;
  movesLimit: number;
}

export interface FeedItem {
  puzzle: Puzzle;
  cleared: boolean;
}

export interface AnimationState {
  landedAt: number;
  landingCells: Point[];
  clearingRows: number[];
  clearStartedAt: number;
  message: string;
  messageStartedAt: number;
  feedSlide: number;
  feedSlideX: number;
  feedShake: number;
  previousPuzzle?: Puzzle;
  previousGrid?: Cell[][];
}

export interface GameSnapshot {
  mode: GameMode;
  puzzle: Puzzle;
  grid: Cell[][];
  current: Piece | null;
  next: PieceKind | null;
  blocksLeft: number;
  linesCleared: number;
  feed: FeedItem[];
  feedIndex: number;
  soundOn: boolean;
  animation: AnimationState;
}
