import type { PieceKind } from "./gameTypes";

type ColorPair = { fill: string; stroke: string };

export const PIECE_COLORS: Record<PieceKind | "garbage" | "wall", ColorPair> = {
  I: { fill: "var(--gb-piece-i)", stroke: "var(--gb-piece-i-dark)" },
  O: { fill: "var(--gb-piece-o)", stroke: "var(--gb-piece-o-dark)" },
  T: { fill: "var(--gb-piece-t)", stroke: "var(--gb-piece-t-dark)" },
  S: { fill: "var(--gb-piece-s)", stroke: "var(--gb-piece-s-dark)" },
  Z: { fill: "var(--gb-piece-z)", stroke: "var(--gb-piece-z-dark)" },
  L: { fill: "var(--gb-piece-l)", stroke: "var(--gb-piece-l-dark)" },
  J: { fill: "var(--gb-piece-j)", stroke: "var(--gb-piece-j-dark)" },
  garbage: { fill: "var(--gb-piece-garbage)", stroke: "var(--gb-piece-garbage-dark)" },
  wall: { fill: "var(--gb-ink-soft)", stroke: "var(--gb-ink)" },
};

export const GHOST_COLOR: ColorPair = {
  fill: "var(--gb-ghost)",
  stroke: "var(--gb-ghost-line)",
};

export const TOKENS = {
  ink: "var(--gb-ink)",
  inkSoft: "var(--gb-ink-soft)",
  inkMute: "var(--gb-ink-mute)",
  bgFrame: "var(--gb-bg-frame)",
  bgScreen: "var(--gb-bg-screen)",
  bgBoard: "var(--gb-bg-board)",
  bgPanel: "var(--gb-bg-panel)",
  accent: "var(--gb-accent)",
  accentSoft: "var(--gb-accent-soft)",
  success: "var(--gb-success)",
  warning: "var(--gb-warning)",
  danger: "var(--gb-danger)",
  info: "var(--gb-info)",
} as const;

const cache = new Map<string, string>();

export function resolveCssVar(value: string): string {
  const cached = cache.get(value);
  if (cached) return cached;
  const match = /^var\((--[\w-]+)\)$/.exec(value.trim());
  if (!match) {
    cache.set(value, value);
    return value;
  }
  const computed = getComputedStyle(document.documentElement)
    .getPropertyValue(match[1])
    .trim();
  if (!computed) return value;
  cache.set(value, computed);
  return computed;
}

export function clearColorCache(): void {
  cache.clear();
}
