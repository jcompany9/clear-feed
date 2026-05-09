import { COLS, ROWS, type Cell, type PieceKind } from "./gameTypes";

/** 셀 값 ↔ 한 글자 매핑 — URL에 들어가도 안전한 ASCII만 사용 */
const CELL_TO_CHAR: Record<string, string> = {
  null: ".",
  I: "I",
  O: "O",
  T: "T",
  L: "L",
  J: "J",
  S: "S",
  Z: "Z",
  garbage: "g",
  wall: "w",
};

const CHAR_TO_CELL: Record<string, Cell> = {
  ".": null,
  I: "I",
  O: "O",
  T: "T",
  L: "L",
  J: "J",
  S: "S",
  Z: "Z",
  g: "garbage",
  w: "wall",
};

const VALID_PIECE_CHARS = new Set(["I", "O", "T", "L", "J", "S", "Z"]);

/**
 * 보드 + 큐를 URL-safe base64 문자열로 인코딩.
 * 형식: <200글자 grid>:<가변길이 queue> → base64url
 *
 * 평균 길이 ~290 chars (빈 보드 기준). 모든 브라우저/메신저 URL 한도 안.
 */
export function encodePuzzle(grid: Cell[][], queue: PieceKind[]): string {
  let gridStr = "";
  for (const row of grid) {
    for (const cell of row) {
      gridStr += cell === null ? "." : CELL_TO_CHAR[cell];
    }
  }
  const queueStr = queue.join("");
  return base64UrlEncode(`${gridStr}:${queueStr}`);
}

/**
 * URL-safe base64 → 보드 + 큐. 형식 오류면 null.
 */
export function decodePuzzle(encoded: string): { grid: Cell[][]; queue: PieceKind[] } | null {
  try {
    const decoded = base64UrlDecode(encoded);
    const sepIdx = decoded.indexOf(":");
    if (sepIdx === -1) return null;
    const gridStr = decoded.slice(0, sepIdx);
    const queueStr = decoded.slice(sepIdx + 1);

    if (gridStr.length !== COLS * ROWS) return null;

    const grid: Cell[][] = [];
    for (let y = 0; y < ROWS; y += 1) {
      const row: Cell[] = [];
      for (let x = 0; x < COLS; x += 1) {
        const ch = gridStr[y * COLS + x];
        if (!(ch in CHAR_TO_CELL)) return null;
        row.push(CHAR_TO_CELL[ch]);
      }
      grid.push(row);
    }

    const queue: PieceKind[] = [];
    for (const ch of queueStr) {
      if (!VALID_PIECE_CHARS.has(ch)) return null;
      queue.push(ch as PieceKind);
    }

    return { grid, queue };
  } catch {
    return null;
  }
}

function base64UrlEncode(s: string): string {
  // 모든 입력 문자는 ASCII이므로 btoa 안전
  const b64 = btoa(s);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (padded.length % 4)) % 4;
  return atob(padded + "=".repeat(padding));
}
