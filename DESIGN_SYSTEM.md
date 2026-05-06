# Clear Feed — 디자인 시스템 v1.0

> **Theme:** Game Boy Color (1998)
> **Project:** Clear Feed (Pockettops 호환)
> **Last updated:** 2026-05-06

---

## 1. 컨셉 한 줄

**"1998년 Game Boy Color로 즐기는 인스타 릴스 테트리스"**

- 베이스: 따뜻한 크림 배경 (LCD 화면 느낌)
- 테트로미노: 파스텔 7색 (구분 명확)
- 외곽선: 진한 네이비/검정 (8비트 픽셀 느낌)
- 폰트: 모노스페이스 픽셀 폰트
- 애니메이션: 불연속 stepped (프레임 단위, 부드러운 fade 금지)

---

## 2. 컬러 팔레트 (확정)

### 베이스 컬러

```css
:root {
  /* 배경 */
  --gb-bg-frame:    #2d2d3a;  /* 외곽 프레임 (다크 네이비) */
  --gb-bg-screen:   #f8e8c8;  /* LCD 외곽 (따뜻한 크림) */
  --gb-bg-board:    #fff5e0;  /* 게임 보드 (밝은 크림) */
  --gb-bg-panel:    #faedd0;  /* 사이드 패널 */

  /* 외곽선/텍스트 */
  --gb-ink:         #1a1a2e;  /* 진한 네이비 (모든 외곽선 + 메인 텍스트) */
  --gb-ink-soft:    #4a4a5e;  /* 보조 텍스트 */
  --gb-ink-mute:    #888899;  /* 가장 옅은 텍스트 */

  /* 악센트 */
  --gb-accent:      #d63031;  /* 빨강 강조 (점수, 경고) */
  --gb-accent-soft: #ff7675;  /* 연한 빨강 */
}
```

### 테트로미노 7색 (테트리스 표준 매핑)

```css
:root {
  /* I-piece (긴 막대) - 시안 계열 */
  --gb-piece-i:     #74b9ff;
  --gb-piece-i-dark:#1e6ba8;  /* 외곽선용 */

  /* O-piece (정사각) - 노란 계열 */
  --gb-piece-o:     #fdcb2e;
  --gb-piece-o-dark:#a07a00;

  /* T-piece (T자) - 보라 계열 */
  --gb-piece-t:     #a29bfe;
  --gb-piece-t-dark:#5a51c4;

  /* S-piece - 초록 계열 */
  --gb-piece-s:     #55efc4;
  --gb-piece-s-dark:#1b9871;

  /* Z-piece - 빨간/핑크 계열 */
  --gb-piece-z:     #fab1a0;
  --gb-piece-z-dark:#c46556;

  /* L-piece - 주황 계열 */
  --gb-piece-l:     #ffa657;
  --gb-piece-l-dark:#b56611;

  /* J-piece - 파란 계열 */
  --gb-piece-j:     #6c5ce7;
  --gb-piece-j-dark:#3a2faa;

  /* 고스트 (낙하 예측) */
  --gb-ghost:       rgba(26, 26, 46, 0.15);
  --gb-ghost-line:  rgba(26, 26, 46, 0.35);
}
```

### 시맨틱 컬러

```css
:root {
  --gb-success: #00b894;  /* 라인 클리어 시 플래시 */
  --gb-warning: #fdcb6e;  /* 위험 (블록 쌓임) */
  --gb-danger:  #d63031;  /* 게임 오버 */
  --gb-info:    #74b9ff;  /* 챌린지 모드 표시 */
}
```

### 픽셀 디테일

게임보이 LCD 느낌을 살리는 미세 효과:

```css
/* LCD 스캔라인 (옵션, opacity 0.04~0.06) */
.lcd-scanlines {
  background-image: repeating-linear-gradient(
    0deg,
    transparent 0px,
    transparent 2px,
    rgba(26, 26, 46, 0.04) 2px,
    rgba(26, 26, 46, 0.04) 3px
  );
}

/* LCD 그리드 (옵션) */
.lcd-grid {
  background-image:
    repeating-linear-gradient(0deg, rgba(26,26,46,0.03) 0 1px, transparent 1px 18px),
    repeating-linear-gradient(90deg, rgba(26,26,46,0.03) 0 1px, transparent 1px 18px);
}
```

---

## 3. 타이포그래피

### 폰트 스택

```css
:root {
  /* 본문/UI (모노스페이스 픽셀) */
  --gb-font-pixel: 'Press Start 2P', 'VT323', 'Pixelify Sans', monospace;

  /* 숫자 (점수, 시간) - 가독성 우선 */
  --gb-font-mono: 'JetBrains Mono', 'SF Mono', 'Courier New', monospace;

  /* fallback (시스템 폰트) */
  --gb-font-system: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
```

### 폰트 도입 방법

```html
<!-- index.html -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
```

### 사이즈 시스템

```css
:root {
  /* 픽셀 폰트는 기본적으로 작게 보이므로 큼직하게 */
  --text-pixel-xs: 8px;   /* 캡션 (UI 라벨) */
  --text-pixel-sm: 10px;  /* 보조 정보 */
  --text-pixel-md: 12px;  /* 본문 */
  --text-pixel-lg: 16px;  /* 강조 */
  --text-pixel-xl: 20px;  /* 큰 점수, 헤더 */
  --text-pixel-hero: 24px;/* GAME OVER 같은 */

  /* 모노스페이스 (점수 등) */
  --text-mono-md: 14px;
  --text-mono-lg: 18px;
  --text-mono-xl: 24px;
}
```

### 폰트 사용 가이드

| 용도 | 폰트 | 크기 |
|---|---|---|
| 점수 숫자 | `--gb-font-mono` (bold) | `--text-mono-xl` |
| 게임 타이틀 | `--gb-font-pixel` | `--text-pixel-xl` |
| UI 라벨 (SCORE, NEXT, HOLD) | `--gb-font-pixel` (bold) | `--text-pixel-sm` |
| GAME OVER | `--gb-font-pixel` | `--text-pixel-hero` |
| 피드 힌트 (↑ skip) | `--gb-font-pixel` | `--text-pixel-xs` |

---

## 4. 모서리/외곽선

게임보이 픽셀 게임은 **외곽선이 있고 모서리가 sharp**한 게 정체성.

```css
:root {
  --gb-border-w: 2px;          /* 표준 외곽선 두께 */
  --gb-border-w-thin: 1px;     /* 미세 구분선 */
  --gb-border-w-thick: 3px;    /* 강조 (게임 보드 외곽) */

  --gb-border-color: var(--gb-ink);

  /* 모서리 - SHARP (둥근 거 거의 없음) */
  --gb-radius-none: 0;
  --gb-radius-sm: 2px;          /* 살짝만 (내부 카드) */
  --gb-radius-md: 4px;          /* 버튼 */
  /* radius-lg, xl 등 사용 안 함 (둥근 게 너무 많으면 게임보이 느낌 X) */
}
```

### 외곽선 스타일

```css
/* 게임 보드 외곽 (가장 두꺼움) */
.gb-frame {
  border: var(--gb-border-w-thick) solid var(--gb-border-color);
}

/* 일반 카드 */
.gb-card {
  border: var(--gb-border-w) solid var(--gb-border-color);
  border-radius: var(--gb-radius-sm);
}

/* 빈 슬롯 (점선) */
.gb-slot-empty {
  border: var(--gb-border-w) dashed var(--gb-border-color);
  border-radius: 0;
}

/* 비활성/대기 (옅은 점선) */
.gb-pending {
  border: 1px dashed rgba(26, 26, 46, 0.3);
}
```

---

## 5. 그림자 / 픽셀 입체감

게임보이 톤은 **블러/그라디언트 그림자 사용 안 함**. 대신 **하드 픽셀 그림자**:

```css
:root {
  /* 픽셀 입체감 (1~2px 오프셋, 블러 없음) */
  --gb-shadow-pixel: 2px 2px 0 var(--gb-ink);
  --gb-shadow-pixel-sm: 1px 1px 0 var(--gb-ink);
  --gb-shadow-pixel-press: 0 0 0 var(--gb-ink);  /* 눌렸을 때 그림자 사라짐 */
}

/* 버튼 예시 */
.gb-button {
  background: var(--gb-bg-panel);
  border: var(--gb-border-w) solid var(--gb-ink);
  box-shadow: var(--gb-shadow-pixel);
  transition: none;  /* 부드러운 전환 X, 즉각 변화 */
}

.gb-button:active {
  transform: translate(2px, 2px);
  box-shadow: var(--gb-shadow-pixel-press);
}

/* 테트로미노 블록 (외곽선 + 내부 음영) */
.gb-block {
  border: var(--gb-border-w-thin) solid var(--gb-ink);
  /* 위/왼쪽: 밝은 색, 아래/오른쪽: 어두운 색으로 입체감 */
  box-shadow:
    inset 1px 1px 0 rgba(255, 255, 255, 0.4),
    inset -1px -1px 0 rgba(0, 0, 0, 0.2);
}
```

---

## 6. 애니메이션

게임보이는 60fps 부드러운 애니메이션이 아니라 **불연속 프레임**이 정체성.

### 핵심 원칙
- **stepped easing 사용** (smooth easing 금지)
- **transition duration은 짧게** (보통 50~150ms)
- **블링크/플래시 활용** (옛날 게임 느낌)

### CSS 변수

```css
:root {
  /* 게임보이는 60fps가 아닌 ~30fps 느낌 → stepped */
  --gb-ease-step-3: steps(3, end);   /* 3프레임 */
  --gb-ease-step-5: steps(5, end);   /* 5프레임 (조금 더 부드러움) */
  --gb-ease-step-8: steps(8, end);   /* 8프레임 (UI 전환) */

  --gb-duration-fast: 80ms;    /* 클릭 반응 */
  --gb-duration-normal: 150ms; /* 표준 전환 */
  --gb-duration-slow: 300ms;   /* 큰 화면 전환 */
}
```

### 키프레임

```css
/* 라인 클리어 (강조 플래시) */
@keyframes gb-line-clear {
  0%   { background: var(--gb-bg-board); }
  20%  { background: var(--gb-success); }
  40%  { background: var(--gb-bg-board); }
  60%  { background: var(--gb-success); }
  100% { background: var(--gb-bg-board); }
}

.line-clearing {
  animation: gb-line-clear 300ms steps(5, end);
}

/* 블록 락 (살짝 흔들림) */
@keyframes gb-lock {
  0%   { transform: translate(0, 0); }
  50%  { transform: translate(0, 2px); }
  100% { transform: translate(0, 0); }
}

.locking {
  animation: gb-lock 100ms steps(2, end);
}

/* 게임 오버 (외곽선 깜빡임) */
@keyframes gb-blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0.3; }
}

.game-over .gb-frame {
  animation: gb-blink 400ms infinite steps(2, end);
}

/* 피드 전환 (인스타 릴스 같은 슬라이드) */
@keyframes gb-feed-slide-up {
  0%   { transform: translateY(0); opacity: 1; }
  100% { transform: translateY(-100%); opacity: 0; }
}

@keyframes gb-feed-slide-in-from-bottom {
  0%   { transform: translateY(100%); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}

.feed-exit { animation: gb-feed-slide-up 250ms steps(8, end); }
.feed-enter { animation: gb-feed-slide-in-from-bottom 250ms steps(8, end); }
```

---

## 7. 테트로미노 컬러 매핑

각 테트로미노 종류별 색상 - 게임 코드에서 사용:

```typescript
// gameTypes.ts에 추가 또는 별도 colors.ts
export const PIECE_COLORS = {
  I: { fill: 'var(--gb-piece-i)', stroke: 'var(--gb-piece-i-dark)' },
  O: { fill: 'var(--gb-piece-o)', stroke: 'var(--gb-piece-o-dark)' },
  T: { fill: 'var(--gb-piece-t)', stroke: 'var(--gb-piece-t-dark)' },
  S: { fill: 'var(--gb-piece-s)', stroke: 'var(--gb-piece-s-dark)' },
  Z: { fill: 'var(--gb-piece-z)', stroke: 'var(--gb-piece-z-dark)' },
  L: { fill: 'var(--gb-piece-l)', stroke: 'var(--gb-piece-l-dark)' },
  J: { fill: 'var(--gb-piece-j)', stroke: 'var(--gb-piece-j-dark)' },
  GHOST: { fill: 'var(--gb-ghost)', stroke: 'var(--gb-ghost-line)' },
} as const

// renderer.ts에서 CSS 변수 → 실제 색 변환
function resolveColor(cssVar: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(cssVar.replace(/^var\(|\)$/g, ''))
    .trim()
}
```

---

## 8. 컴포넌트별 스펙

### 게임 보드

```
크기: 220px x 440px (10×20 그리드, 한 칸 22px)
외곽선: 3px solid var(--gb-ink)
배경: var(--gb-bg-board)
내부 그리드: 0.5px rgba(26,26,46,0.05)
```

### 테트로미노 한 칸

```
크기: 22px x 22px
외곽선: 1px solid (피스별 dark 색)
내부: 피스별 fill 색
입체감: inset shadow (위/왼쪽 밝게, 아래/오른쪽 어둡게)
```

### Score / Next / Hold 패널

```
배경: var(--gb-bg-panel)
외곽선: 2px solid var(--gb-ink)
모서리: 2px (sharp)
패딩: 8px 12px
라벨 폰트: 'Press Start 2P' 10px
값 폰트: 'JetBrains Mono' 16px bold
```

### 피드 힌트 (↑ skip / ↓ retry / → challenge)

```
위치: 화면 우측 또는 하단
폰트: 'Press Start 2P' 8~10px
색: var(--gb-ink-mute)
opacity: 0.7
```

---

## 9. 화면별 레이아웃

### 메인 게임 화면

```
┌────────────────────────────┐  ← var(--gb-bg-frame) #2d2d3a
│  [LCD 화면 영역]            │
│ ┌────────────────────────┐ │  ← var(--gb-bg-screen) #f8e8c8
│ │ SCORE        LV  TIME  │ │
│ │ 012450       03  00:42 │ │
│ │                        │ │
│ │ ┌──────────┐ ┌─NEXT─┐  │ │
│ │ │          │ │  ▩▩  │  │ │
│ │ │  GAME    │ │  ▩   │  │ │
│ │ │  BOARD   │ └──────┘  │ │
│ │ │          │ ┌─HOLD─┐  │ │
│ │ │  10×20   │ │      │  │ │
│ │ │          │ └──────┘  │ │
│ │ │          │           │ │
│ │ │          │ ↑ skip    │ │
│ │ │          │ ↓ retry   │ │
│ │ │          │ → chal    │ │
│ │ └──────────┘            │ │
│ │                         │ │
│ │      ◀ ▼ ▶  ⟲          │ │  ← 가상 D-패드 (모바일)
│ └────────────────────────┘ │
└────────────────────────────┘
```

### 게임 오버 화면 (오버레이)

```
┌────────────────────────────┐
│ (배경 dim, 보드 그대로 보임) │
│                            │
│ ┌──────────────────────┐   │
│ │   ✦  GAME OVER  ✦    │   │
│ │                      │   │
│ │   SCORE: 012450      │   │
│ │   LINES: 12          │   │
│ │   LEVEL: 03          │   │
│ │                      │   │
│ │   ↑ NEXT PUZZLE      │   │
│ │   ↓ TRY AGAIN        │   │
│ └──────────────────────┘   │
│                            │
└────────────────────────────┘
```

### 챌린지 모드 진입 (가로 슬라이드)

가로 슬라이드 시 화면 상단에 띠 표시:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━
   ⚡ CHALLENGE MODE ⚡
━━━━━━━━━━━━━━━━━━━━━━━━━━
(노란 띠, 250ms 후 fade)
```

---

## 10. 사운드 가이드 (옵션)

게임보이 톤이면 사운드도 8비트가 필수.

### Web Audio API 활용

기존 `src/sound.ts` 가 이미 있으므로 사운드 톤 정리:

| 액션 | 음색 | 길이 |
|---|---|---|
| 블록 회전 | square wave 440Hz | 50ms |
| 블록 이동 | square wave 220Hz | 30ms |
| 블록 락 | square wave 110Hz + 노이즈 | 80ms |
| 라인 1줄 | 상승 음 (220 → 440) | 200ms |
| 라인 4줄 (테트리스!) | 음계 상승 | 500ms |
| 게임 오버 | 하강 음 (440 → 110) | 800ms |
| 피드 스와이프 | 화이트 노이즈 burst | 100ms |
| 챌린지 진입 | 팡파레 (3음) | 400ms |

---

## 11. 다크 모드 변형 (선택)

게임보이 코어 톤은 라이트지만, 다크 모드는 **외곽 프레임만 더 어둡게** + 화면은 그대로:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --gb-bg-frame: #0a0a14;  /* 더 어둡게 */
    /* LCD 화면은 그대로 (게임보이 LCD는 백라이트 없음) */
  }
}
```

---

## 12. PWA 매니페스트 업데이트

```json
{
  "name": "Clear Feed",
  "short_name": "Clear Feed",
  "description": "Tetris reels — swipe through endless puzzles",
  "theme_color": "#2d2d3a",
  "background_color": "#f8e8c8",
  "display": "standalone",
  "orientation": "portrait",
  "icons": [
    /* 게임보이 톤 아이콘으로 교체 */
  ]
}
```

---

**문서 버전:** v1.0
**최종 결정:** Game Boy Color (1998) 톤
