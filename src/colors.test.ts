import { describe, it, expect, beforeEach } from "vitest";
import { GHOST_COLOR, PIECE_COLORS, TOKENS, clearColorCache, resolveCssVar } from "./colors";

describe("PIECE_COLORS", () => {
  it("has fill and stroke for all 7 piece kinds + garbage", () => {
    const keys = ["I", "O", "T", "S", "Z", "L", "J", "garbage"] as const;
    for (const kind of keys) {
      const entry = PIECE_COLORS[kind];
      expect(entry).toBeDefined();
      expect(entry.fill.startsWith("var(--gb-")).toBe(true);
      expect(entry.stroke.startsWith("var(--gb-")).toBe(true);
    }
  });

  it("uses dark variant for stroke (different from fill)", () => {
    expect(PIECE_COLORS.I.fill).not.toBe(PIECE_COLORS.I.stroke);
  });
});

describe("GHOST_COLOR", () => {
  it("uses the ghost CSS variables", () => {
    expect(GHOST_COLOR.fill).toBe("var(--gb-ghost)");
    expect(GHOST_COLOR.stroke).toBe("var(--gb-ghost-line)");
  });
});

describe("TOKENS", () => {
  it("exposes core background and ink tokens", () => {
    expect(TOKENS.bgFrame).toBe("var(--gb-bg-frame)");
    expect(TOKENS.bgScreen).toBe("var(--gb-bg-screen)");
    expect(TOKENS.bgBoard).toBe("var(--gb-bg-board)");
    expect(TOKENS.ink).toBe("var(--gb-ink)");
  });
});

describe("resolveCssVar", () => {
  beforeEach(() => {
    clearColorCache();
    document.documentElement.style.removeProperty("--gb-test-color");
  });

  it("returns the input untouched when not a var() expression", () => {
    expect(resolveCssVar("#ff0000")).toBe("#ff0000");
    expect(resolveCssVar("rgba(0,0,0,0.5)")).toBe("rgba(0,0,0,0.5)");
  });

  it("resolves a defined CSS variable to its computed value", () => {
    document.documentElement.style.setProperty("--gb-test-color", "#abcdef");
    expect(resolveCssVar("var(--gb-test-color)")).toBe("#abcdef");
  });

  it("falls back to the original var() when the variable is undefined", () => {
    expect(resolveCssVar("var(--gb-nonexistent)")).toBe("var(--gb-nonexistent)");
  });

  it("does not cache failed resolutions (so a later definition is picked up)", () => {
    expect(resolveCssVar("var(--gb-test-color)")).toBe("var(--gb-test-color)");
    document.documentElement.style.setProperty("--gb-test-color", "#123456");
    expect(resolveCssVar("var(--gb-test-color)")).toBe("#123456");
  });
});
