export const COLS = 10;
export const ROWS = 20;

export type PieceKind = "I" | "O" | "T" | "L" | "J" | "S" | "Z";
export type Difficulty = "Easy" | "Normal" | "Hard" | "Challenge";
export type GameMode = "feed" | "planning" | "clear" | "failed" | "editing";

export type Cell = PieceKind | "garbage" | "wall" | "target" | null;

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
  editShake: number;  // 에디터 거부 시 보드 흔들기
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
  // 타겟 미션 (퍼즐 초기 보드에 "target" 셀이 있으면 활성)
  isTargetMission: boolean;          // true = 타겟 모두 클리어 미션
  targetsTotal: number;              // 시작 시 타겟 셀 총 개수 (X/Y 표시용)
  targetsLeft: number;               // 현재 남은 타겟 셀 수

  // Editing 모드 전용 (UGC 에디터)
  editGrid: Cell[][];                // 사용자 디자인 보드
  editQueueLength: number;           // 큐 길이 설정 (1~10)
  editFoundQueue: PieceKind[] | null;  // generate 후 발견된 큐
  editStatus: "idle" | "generating" | "ready" | "no-solution";
  editTool: PieceKind;               // 현재 활성 피스 (큐의 첫 항목과 동기화)
  editToolRotation: number;          // 피스 회전 (0~3)
  editFeasibleLengths: number[];     // 현재 보드에서 수학적으로 풀이 가능한 큐 길이 (1~10 범위)
  editHoverGhost: { cells: Point[]; kind: PieceKind; valid: boolean } | null;  // drop 안착 미리보기
  // Editor "real-tetris" 모드: 무작위 큐 + drop placement, 라인 클리어 발생 시 거부
  editPieceQueue: PieceKind[];       // 다음 피스 큐 (5개 이상 유지)
  editSolutionEstimate: number;      // 현재 보드에서 풀이 가능한 큐 추정 개수 (마지막 분석 결과)
  editAnalyzing: boolean;            // 분석 진행 중
  editCurrentPiece: Piece | null;    // 현재 떨어지고 있는 피스 (위치 + 회전 포함)
  editGhostCells: Point[] | null;    // 현재 피스가 떨어질 안착 위치
}
