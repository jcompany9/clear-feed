export const COLS = 10;
export const ROWS = 20;

export type PieceKind = "I" | "O" | "T" | "L" | "J" | "S" | "Z";
export type Difficulty = "Easy" | "Normal" | "Challenge";
export type GameMode = "feed" | "planning" | "clear" | "failed";

export type Cell = PieceKind | "garbage" | "wall" | null;

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
  toast: string;
  toastAt: number;
  feedSlide: number;
  feedSlideX: number;
  feedShake: number;
  touchTrail: Array<{ x: number; y: number }>;  // 터치 드래그 궤적 (화면 좌표)
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
  // Planning 모드 전용
  queueIndex: number;        // 사용된 피스 수 (= usedIndices.length, 호환성용)
  attempts: number;          // 현재 퍼즐 시도 횟수 (실패 누적)
  currentRotation: number;   // 다음 배치할 피스의 회전 상태 (0~3)
  planningGhost: { cells: Point[]; kind: PieceKind } | null;  // 마우스 호버 위치의 미리보기 셀들
  selectedIndex: number;     // 현재 선택된 큐 인덱스 (사용자가 다음에 둘 피스)
  usedIndices: number[];     // 이미 사용된 큐 인덱스 (정렬되지 않을 수 있음)
}
