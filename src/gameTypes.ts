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

export interface PlannedMove {
  x: number;
  rotation: number; // 0~3
}

export interface PlannedGhost {
  cells: Point[];
  kind: PieceKind;
  queueIndex: number;
  isActive: boolean;
  valid: boolean;  // false = 배치 불가능 (다른 ghost와 충돌)
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
  attempts: number;                              // 현재 퍼즐 시도 횟수 (실패 누적)
  activeEditIndex: number | null;                // 현재 편집 중인 큐 인덱스
  currentRotation: number;                       // active 피스의 회전 상태 (0~3)
  plannedMoves: Array<PlannedMove | null>;       // 큐 길이만큼, null이면 미계획
  plannedGhosts: PlannedGhost[];                 // 시뮬레이션 결과 ghost 셀들
  canExecute: boolean;                           // 모든 피스 계획됨 → START 활성화
}
