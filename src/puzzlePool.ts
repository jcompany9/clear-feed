/**
 * 백그라운드 퍼즐 풀 — 워커가 미리 생성한 어려운 퍼즐 캐시.
 * 셔플 시 풀에서 즉시 pop, 빈 슬롯은 워커가 백그라운드로 채움.
 */
import type { Puzzle } from "./gameTypes";

const TARGET_SIZE = 5;      // 풀 크기 — 5개 random rotation 테스트 (사용자 요청)
const MAX_INFLIGHT = 2;     // 동시 생성 요청 한도 (워커 1개 + 큐)

export class PuzzlePool {
  private pool: Puzzle[] = [];
  private worker: Worker | null = null;
  private inFlight = 0;
  private nextSeed = Math.floor(Math.random() * 1_000_000);

  constructor() {
    if (typeof Worker === "undefined") return;
    try {
      this.worker = new Worker(new URL("./puzzlePoolWorker.ts", import.meta.url), { type: "module" });
      this.worker.addEventListener("message", this.onMessage);
      // 초기 풀 채움 (백그라운드)
      this.refill();
    } catch {
      // Worker 미지원 환경 (테스트 등) — 풀 없이 동작
      this.worker = null;
    }
  }

  /** 풀에서 퍼즐 1개를 무작위로 꺼냄. 비어있으면 null (호출측이 sync 폴백) */
  pop(): Puzzle | null {
    if (this.pool.length === 0) return null;
    const idx = Math.floor(Math.random() * this.pool.length);
    const [p] = this.pool.splice(idx, 1);
    this.refill();  // 즉시 백그라운드 채움
    return p ?? null;
  }

  /** 현재 풀 사이즈 (디버그용) */
  size(): number {
    return this.pool.length;
  }

  private refill(): void {
    if (!this.worker) return;
    while (this.pool.length + this.inFlight < TARGET_SIZE && this.inFlight < MAX_INFLIGHT) {
      this.inFlight += 1;
      this.nextSeed = (this.nextSeed + 1013904223) >>> 0;
      this.worker.postMessage({ type: "generate", seed: this.nextSeed });
    }
  }

  private onMessage = (event: MessageEvent<{ type: string; puzzle?: Puzzle }>): void => {
    this.inFlight = Math.max(0, this.inFlight - 1);
    if (event.data.type === "ready" && event.data.puzzle) {
      this.pool.push(event.data.puzzle);
    }
    // 다음 요청 큐 채움 (만약 더 필요하면)
    this.refill();
  };
}

// 앱 전역 싱글톤
let globalPool: PuzzlePool | null = null;

export function getPuzzlePool(): PuzzlePool {
  if (!globalPool) globalPool = new PuzzlePool();
  return globalPool;
}
