import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Loads recorded ESI captures. Never edit a fixture to satisfy a test: if the
 * numbers moved, re-capture with scripts/capture-fixtures.mjs and update both
 * the expectation and docs/spec/intent.md.
 */
export const FIXTURES_DIR = join(process.cwd(), "docs", "spec", "fixtures");

export function readFixtureBody(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name, "response.body.json"), "utf8");
}

export function readFixtureJson<T>(name: string): T {
  return JSON.parse(readFixtureBody(name)) as T;
}

export function readFixtureHeaders(name: string): Record<string, string> {
  const text = readFileSync(
    join(FIXTURES_DIR, name, "response.headers.txt"),
    "utf8",
  );
  const headers: Record<string, string> = {};
  for (const line of text.split(/\r?\n/).slice(1)) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    headers[line.slice(0, colon).trim().toLowerCase()] = line
      .slice(colon + 1)
      .trim();
  }
  return headers;
}
