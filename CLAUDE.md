# Clear Feed — Claude Code 컨텍스트

## 정체
Vite + TypeScript로 만든 Canvas 기반 테트리스형 퍼즐 게임 "Clear Feed".
PWA 지원, Electron 데스크톱 빌드 옵션. **React/프레임워크 없이 순수 TS 클래스 패턴.**

진입점: `index.html` → `src/main.ts` (Canvas `#game` 요소).

## 파일 구조 (전부 src/ 직속, 평면 구조)

| 파일 | 역할 |
|---|---|
| `main.ts` | 부트스트랩, requestAnimationFrame 루프 |
| `game.ts` | `Game` 클래스, 상태 머신 |
| `gameTypes.ts` | 타입 정의 (`COLS=10`, `ROWS=20`, `PieceKind`, `Puzzle` 등) |
| `pieces.ts` | 테트로미노 정의, 회전, `absoluteCells` |
| `puzzleGenerator.ts` | 시드 기반 결정론적 퍼즐 생성 |
| `renderer.ts` | Canvas 2D 렌더러 |
| `input.ts` | `InputController` (키/터치) |
| `sound.ts` | `SoundSystem` (Web Audio) |
| `storage.ts` | localStorage (마지막 시드, 사운드) |
| `style.css` | 게임 스타일 |
| `colors.ts` | (디자인 시스템 적용 후) 테트로미노 컬러 토큰 |

## 아키텍처 핵심

- `Game`은 내부 상태 보유, `game.snapshot` getter로 `GameSnapshot` 반환
  (불변 스냅샷 패턴 — `Renderer`는 읽기 전용으로만 사용)
- 매 프레임: `game.update(now)` → `renderer.render(game.snapshot, now)`
- 주요 상수 (game.ts 상단): `GRAVITY_MS = 620`, `LOCK_DELAY_MS = 280`
- 그리드/피드 배열은 스냅샷에서 참조 공유 — Renderer가 절대 mutate 금지

## 피드 스크롤 UX (인스타 릴스 스타일)

| 메서드 | 동작 |
|---|---|
| `nextFeed(±1)` | 세로 스크롤 (다음/이전 퍼즐) |
| `challengeFeed()` | 챌린지 진입 (가로 슬라이드 -) |
| `returnFromChallenge()` | 챌린지 복귀 (가로 슬라이드 +) |
| `otherFeed()` | 다른 퍼즐 셔플 (세로) |

애니메이션 값 `feedSlide` / `feedSlideX` / `feedShake`는 매 프레임
0.86~0.78배 감쇠. `feed.slice(-12)`로 최근 12개만 유지.

## 디자인 시스템

전체 사양은 [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) — Game Boy Color (1998) 톤.

### 코드 작성 시 규칙
- 모든 색은 CSS 변수 경유 (하드코딩 금지). 변수 prefix는 `--gb-*`
- 외곽선은 `var(--gb-ink)` 또는 piece별 `*-dark` 색
- 모서리는 항상 sharp (radius 0~4px만)
- 애니메이션은 항상 `steps()` easing (smooth easing 금지)
- transition duration은 짧게 (50~150ms)

## 작업 규칙

- **React 도입 금지** — 게임은 순수 TS 클래스 패턴 유지
- 새 상수는 `game.ts` 상단의 `GRAVITY_MS` 근처에 모은다
- 타입은 `gameTypes.ts`에 추가
- 한국어로 답변
- 패키지 매니저: **npm** (package-lock.json 기준)
- 빌드 검증: `npm run build` (tsc 타입체크 + vite 번들)
- 개발 서버: `npm run dev`

## 테스트 환경

Vitest + happy-dom 기반. 순수 로직만 자동 테스트 (Canvas 렌더러는 수동).

| 명령 | 동작 |
|---|---|
| `npm test` | 1회 실행 (CI/PR용) |
| `npm run test:watch` | 파일 변경 시 재실행 |
| `npm run test:ui` | 브라우저 UI (필요 시 `npm i -D @vitest/ui`) |
| `npm run typecheck` | tsc만 (빌드 X) |

테스트 파일 규칙: `src/**/*.test.ts`. 같은 디렉터리에 `<module>.test.ts` 형식.

### 테스트 작성 시 주의

- `Game` 인스턴스화 시 `SoundSystem`은 `FakeSound`로 대체 (happy-dom에 `AudioContext` 없음 — game.test.ts 참고)
- `puzzleGenerator.ts`는 모듈 레벨 mutable 상태 (`lastTemplate`, `lastDifficulty`)가 있어 테스트 간 결정성이 깨질 수 있음 — 구조적 invariant만 검증
- `localStorage`는 happy-dom 기본 제공. `beforeEach`에서 `localStorage.clear()` 권장

## Solver (UGC 검증용)

`src/solver.ts` — DFS + 메모이제이션 + 회전 대칭 활용 brute-force 솔버.

### API
```ts
solve(puzzle: Puzzle, maxNodes = 200000): SolverResult
```
- `solvable: boolean` — true면 풀이 가능 (확정), false면 불가능 또는 timeout
- `truncated: boolean` — true면 maxNodes 초과 (결과 신뢰 X)
- `steps?: SolverStep[]` — solvable일 때 풀이 시퀀스 (queueIndex, kind, x, rotation)
- `nodesExplored`, `timeMs` — 디버깅/성능 측정

### 사용 예
- UGC 에디터에서 사용자 퍼즐 검증 (공유 전에 solve 호출)
- 자동 생성 퍼즐 필터링 (createFeedPuzzle 결과 중 unsolvable 제외)
- 힌트 시스템 (다음 한 수만 노출)

### findSolvableQueue (큐 자동 생성)
```ts
findSolvableQueue(grid, length, maxAttempts = 50, rng?): FoundQueue | null
```
사용자가 보드만 디자인하면, 시스템이 풀이 가능한 큐를 자동으로 찾아주는 함수.
무작위 큐 생성 → solve()로 검증을 반복. 처음 풀리는 큐 + 풀이 시퀀스 반환.

UGC 에디터 옵션 A의 핵심: "쌓기만 해, 큐는 알아서 만들어줄게".

해결 못 하면 (50번 다 실패) null 반환 → "이 보드는 풀 수 없는 모양"으로 사용자에게 안내.

### 핵심 최적화
- 피스별 회전 수: O=1, I/S/Z=2, T/L/J=4 (대칭)
- 유효 x 범위 사전 계산 (회전된 모양의 minRel/maxRel 기반)
- `(grid_string, queueIndex)` 캐싱으로 중복 상태 스킵
- `wall` 셀 처리: 벽 있는 줄은 영원히 클리어 불가

### 성능
- 5~7 피스 퍼즐: 평균 50~300ms
- maxNodes 기본값 200000 충분
- 위험: 매우 깊은 검색 트리 (8+ 피스, 빈 보드)는 truncated 반환

## 에디터 (UGC Phase 2)

사용자가 직접 보드를 디자인 → 솔버가 큐 자동 생성 → 플레이.

### 흐름
```
[FEED] ──E──→ [EDITING] ──G──→ [솔버 동작]
                                  │
                                  ├─ ready → ENTER → [PLANNING]
                                  └─ no-solution → 보드 수정 후 재시도
```

### Game 메서드
- `enterEditor()` — feed에서만 진입. 빈 보드 + queueLength=5로 시작
- `editToggleCell(x, y)` — 셀 토글 (null ↔ "garbage")
- `setEditQueueLength(delta)` — 큐 길이 ±, 1~10 클램프
- `generateEditedPuzzle()` — `findSolvableQueue` 호출, 결과를 editFoundQueue + editStatus에 저장
- `playEditedPuzzle()` — status가 "ready"일 때만 작동. 만든 퍼즐을 피드에 끼워넣고 planning 시작
- `exitEditor()` — feed로 복귀

### 입력
- E (feed) → 에디터 진입
- 셀 탭 → 토글
- +/- → queueLength
- G → generate
- Enter → playEditedPuzzle (ready 상태에서만)
- Esc → exitEditor

### 상태 머신
- `editStatus: "idle" | "generating" | "ready" | "no-solution"`
- 보드 또는 큐 길이 변경 시 `editFoundQueue`/`editStatus` 자동 무효화

### 알려진 한계
- 솔버 generate가 동기 호출이라 큰 퍼즐(length 10+) 시도 시 UI 멈춤 (수십 초 가능)
- 향후: Web Worker로 비동기화 또는 generating 중 토스트
- 사용자 보드는 모두 `garbage` 컬러 (피스별 색은 다음 이터레이션)

## URL 공유 (UGC Phase 1)

- `?seed=N` 파라미터로 특정 퍼즐을 첫 피드 위치에 로드
  (예: `http://localhost:5174/?seed=12345`)
- 키보드 `C` → 현재 퍼즐의 공유 URL을 클립보드에 복사 + 1.5초 토스트
- `Game.copyShareUrl()` 사용. clipboard API 실패 시 fallback 토스트
- 결정론적 시드 기반이라 백엔드 0개로 P2P 공유 가능
- 추후: 진짜 맵 에디터 (천장/바닥/큐 직접 편집), 닉네임, 일일 챌린지

## 게임 모드: Planning ("Tetris Golf") — 순차 계획형 (Plan A)

표준 테트리스에 가까운 턴제 퍼즐. 한 피스씩 다루며, 자동 중력 없음 (사용자가 명시적으로 드롭). 무제한 undo로 계획적 풀이 가능.

### 흐름
1. **planning**: 큐의 첫 피스가 보드 상단(x=4, y=1)에 스폰
2. 사용자가 **이동/회전**으로 위치 조정 후 **드롭** — 피스가 바닥까지 떨어져 잠김 + 라인 클리어
3. 다음 피스 자동 스폰. 큐 다 쓰면 evaluate.
4. **clear**: 보드 완전히 비움 → `HOLE IN ONE`(1회) / `SOLVED IN N`
5. **failed**: 큐 다 썼는데 블록 남음 → 같은 퍼즐 재시도 (attempts 누적)
6. **undo**: 직전 드롭 무름 (히스토리 스냅샷). 무제한 가능.

### 핵심 데이터
- `currentPiece: Piece | null` — 현재 컨트롤 중인 피스 (위치+회전 포함)
- `queueIndex: number` — 다음 스폰할 큐 인덱스
- `history: PlacementSnapshot[]` — 드롭 직전 grid+queueIndex 스냅샷, undo용
- `ghostCells: Point[] | null` (snapshot) — 현재 피스 안착 예측 위치

### Game 메서드 (planning 모드)
- `moveCurrent(dx)` — 좌/우 1칸
- `setPieceColumn(col)` — 특정 컬럼으로 직접 이동 (충돌 시 도중 멈춤, 드래그용)
- `rotateCurrent()` — 회전 + 벽 차기 (kicks: -2,-1,0,1,2)
- `dropCurrent()` — 바닥까지 떨어뜨려 잠금, 라인 클리어, 다음 스폰
- `undoLastPlacement()` — history pop, grid 복원, 직전 피스 재스폰

### 입력 정리
**키보드:**
- ←/→ — 좌/우 이동
- ↑ / R / Space — 회전
- ↓ / Enter — 드롭
- U / Backspace — undo
- Esc — abandon

**터치:**
- 드래그(가로) — 피스 컬럼 이동 (시작 시점 피스 위치 기준 셀 단위 변환)
- 탭(이동 거의 없음) — 회전
- 아래로 큰 스와이프(>60px) — 드롭
- 위로 큰 스와이프(>60px) — abandon
- 손가락 trail은 화면에 점선으로 시각화

**Renderer:**
- `screenToColumn(x,y)` — 화면 좌표 → 보드 컬럼
- `getCellSize()` — 드래그 픽셀 → 컬럼 변환용

### 상태 머신
```
feed ──tap──→ planning ──evaluate──→ clear ──tap──→ feed (next)
                  │                    │
                  └────evaluate───→ failed ──tap──→ planning (retry, attempts++)
                  └────up swipe───→ feed (abandon)
```

### 입력 (planning 모드)
- 탭(컬럼 클릭) = 그 컬럼에 배치
- R / 위 화살표 / 스페이스 = 회전
- 아래 스와이프 / U / Backspace = undo
- 위 스와이프 / Esc = 포기

### Sandwich 모드 (제거됨, 부분 인프라 보존)
이전에 시도한 천장 메커니즘은 commit `e9e5641`에서 추가되었다가 이번에 generator 호출 + 함수 정의 제거로 비활성화됨. 다음 인프라는 향후 다른 용도로 재사용 가능해서 유지:
- `Cell = PieceKind | "garbage" | "wall" | null` 의 `"wall"` 타입
- `Game.clearLines()`의 wall row 제외 로직 (벽이 있는 줄은 클리어 안 됨)
- `colors.ts`의 wall 컬러 페어, `renderer.ts`의 wall 평평 렌더 분기

이 인프라가 있어 향후 **맵 에디터에서 사용자가 직접 벽 배치**하는 기능 추가 시 재활용 가능.

## 알려진 특이점

- **록 딜레이 무한 회피 가능**: `touchingFloorAt`이 좌우 이동/회전 시
  매번 0으로 리셋되어 이론상 사용자가 잠금을 영원히 회피 가능
  (game.ts:153, 165). 현재는 의도적으로 둠.
- `isolatedModules` + `noUnusedLocals` 활성 — 미사용 import는 빌드 실패.
