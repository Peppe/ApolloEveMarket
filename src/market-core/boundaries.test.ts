import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * AGENTS.md: the core is UI-free. If this test fails, something under
 * src/market-core/ has started importing React/Next (or app code), which
 * breaks the layering the whole design rests on.
 */

const CORE_DIR = join(process.cwd(), "src", "market-core");
const FORBIDDEN = [
  /^react($|\/)/,
  /^next($|\/)/,
  /^@\/app($|\/)/,
  /^@\/components($|\/)/,
];

function coreFiles(): string[] {
  return readdirSync(CORE_DIR, { recursive: true })
    .map((entry) => String(entry))
    .filter((entry) => entry.endsWith(".ts") && !entry.endsWith(".test.ts"));
}

describe("module boundaries", () => {
  it("finds the core files", () => {
    expect(coreFiles().length).toBeGreaterThan(5);
  });

  it("keeps src/market-core free of React and Next imports", () => {
    const offenders: string[] = [];

    for (const file of coreFiles()) {
      const text = readFileSync(join(CORE_DIR, file), "utf8");
      for (const match of text.matchAll(/from\s+["']([^"']+)["']/g)) {
        const specifier = match[1] ?? "";
        if (FORBIDDEN.some((pattern) => pattern.test(specifier))) {
          offenders.push(`${file} imports ${specifier}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
