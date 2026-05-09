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

## URL 공유 (UGC Phase 1)

- `?seed=N` 파라미터로 특정 퍼즐을 첫 피드 위치에 로드
  (예: `http://localhost:5174/?seed=12345`)
- 키보드 `C` → 현재 퍼즐의 공유 URL을 클립보드에 복사 + 1.5초 토스트
- `Game.copyShareUrl()` 사용. clipboard API 실패 시 fallback 토스트
- 결정론적 시드 기반이라 백엔드 0개로 P2P 공유 가능
- 추후: 진짜 맵 에디터 (천장/바닥/큐 직접 편집), 닉네임, 일일 챌린지

## 게임 모드: Sandwich

현재 게임의 정체성은 **샌드위치 모드** — 위쪽에 천장(고정 벽 + 구멍 패턴)이 추가된 테트리스 변종. 향후 UGC(사용자 배치 공유)와 결합해 "Tetris Reels" 컨셉 완성 예정.

### 데이터 모델
- `Cell = PieceKind | "garbage" | "wall" | null` — `"wall"`이 천장 셀
- 천장은 `puzzleGenerator.addCeiling()`이 `y=0`에 생성 (구멍 ≥3칸 보장)
- 난이도별 벽 비율: Easy 0.45, Normal 0.55, Challenge 0.65

### 클리어 룰
- `Game.clearLines()`는 벽이 있는 줄을 **클리어 후보에서 제외** — 천장은 영구 벽
- 그 외엔 기존 라인 클리어 룰 그대로

### 렌더
- 벽 셀: `--gb-ink-soft` 평평 단색 (3D 입체감 없음, 일반 피스와 명확히 구분)
- 일반 피스: 기존 그대로 (highlight + shadow inset)

## 알려진 특이점

- **록 딜레이 무한 회피 가능**: `touchingFloorAt`이 좌우 이동/회전 시
  매번 0으로 리셋되어 이론상 사용자가 잠금을 영원히 회피 가능
  (game.ts:153, 165). 현재는 의도적으로 둠.
- `isolatedModules` + `noUnusedLocals` 활성 — 미사용 import는 빌드 실패.
