/**
 * 솔버를 백그라운드 스레드에서 실행. 메인 UI 스레드는 멈추지 않음.
 *
 * 메인 → 워커: { id, grid, length, maxAttempts? }
 * 워커 → 메인: { id, found: { queue, attempts } | null }
 */
import type { Cell, PieceKind } from "./gameTypes";
import { findSolvableQueue } from "./solver";

interface WorkerRequest {
  id: number;
  grid: Cell[][];
  length: number;
  maxAttempts?: number;
}

interface WorkerResponse {
  id: number;
  found: { queue: PieceKind[]; attempts: number } | null;
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const { id, grid, length, maxAttempts } = event.data;
  const result = findSolvableQueue(grid, length, maxAttempts);
  const response: WorkerResponse = {
    id,
    found: result ? { queue: result.queue, attempts: result.attempts } : null,
  };
  (self as unknown as { postMessage: (data: WorkerResponse) => void }).postMessage(response);
});
