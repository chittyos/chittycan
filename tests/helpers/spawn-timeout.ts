import { vi } from "vitest";

/**
 * Call once at the top of a test file that spawns the built CLI or other child
 * processes (issue #198).
 *
 * vitest's defaults (5 s per test, 10 s per hook) suit in-process tests. A test
 * that spawns `node dist/index.js` two or three times, plus git, does not fit
 * them on a busy host: CLI startup alone measured 0.4–0.9 s at load average
 * 10–19 on 4 cores, and such tests timed out with no assertion failing. This
 * raises the bound for the calling file only; in-process files keep the
 * tight defaults. It is a ceiling for a hung child, not a speed expectation.
 */
export function allowForProcessSpawns(): void {
  vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });
}
