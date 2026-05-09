export const COLS = 10;
export const ROWS = 20;

export type PieceKind = "I" | "O" | "T" | "L" | "J" | "S" | "Z";
export type Difficulty = "Easy" | "Normal" | "Challenge";
export type GameMode = "feed" | "planning" | "clear" | "failed" | "editing";

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
  // Planning 모드 전용 (순차 계획형)
  attempts: number;                  // 현재 퍼즐 시도 횟수 (실패 누적)
  queueIndex: number;                // 다음 떨어뜨릴 큐 인덱스
  ghostCells: Point[] | null;        // 현재 피스가 떨어질 안착 위치
  pressedControl: string | null;     // 현재 누름 중인 컨트롤 버튼 ("left"|"right"|"rotate"|"down"|"hardDrop")

  // Editing 모드 전용 (UGC 에디터)
  editGrid: Cell[][];                // 사용자 디자인 보드
  editQueueLength: number;           // 큐 길이 설정 (1~10)
  editFoundQueue: PieceKind[] | null;  // generate 후 발견된 큐
  editStatus: "idle" | "generating" | "ready" | "no-solution";
  editTool: "cell" | PieceKind;      // 현재 선택 도구 (셀 토글 또는 테트로미노)
  editToolRotation: number;          // 피스 도구의 회전 (0~3)
  editFeasibleLengths: number[];     // 현재 보드에서 수학적으로 풀이 가능한 큐 길이 (1~10 범위)
  editHoverGhost: { cells: Point[]; kind: PieceKind | "cell"; valid: boolean } | null;  // 호버 미리보기
}
