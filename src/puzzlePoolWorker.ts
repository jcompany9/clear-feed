/**
 * 백그라운드 퍼즐 풀 워커 — UI 스레드 차단 없이 어려운 퍼즐 생성.
 *
 * 메인 → 워커: { type: "generate", seed }
 * 워커 → 메인: { type: "ready", puzzle } | { type: "failed", seed }
 *
 * 메인은 풀 size 모니터링하다 부족하면 새 seed 요청. 사용자 셔플은 풀에서 즉시 pop.
 */
import { createFeedPuzzle } from "./puzzleGenerator";
import { generateShufflePuzzle } from "./game/adaptPuzzle";
import type { Puzzle } from "./gameTypes";

interface WorkerRequest {
  type: "generate";
  seed: number;
}

interface WorkerReady {
  type: "ready";
  puzzle: Puzzle;
}

interface WorkerFailed {
  type: "failed";
  seed: number;
}

type WorkerResponse = WorkerReady | WorkerFailed;

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const { seed } = event.data;
  try {
    // 1차: 신규 tetrisSolver 어댑터 — 진짜 난이도 필터 통과한 퍼즐
    let puzzle: Puzzle | null = generateShufflePuzzle(seed);
    // 폴백: 기존 createFeedPuzzle (보장된 풀이 가능, 단순 패턴)
    if (!puzzle) puzzle = createFeedPuzzle(seed);
    const response: WorkerReady = { type: "ready", puzzle };
    (self as unknown as { postMessage: (data: WorkerResponse) => void }).postMessage(response);
  } catch {
    const response: WorkerFailed = { type: "failed", seed };
    (self as unknown as { postMessage: (data: WorkerResponse) => void }).postMessage(response);
  }
});
