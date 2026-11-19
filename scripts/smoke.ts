/**
 * Live wiring check. NOT part of `npm test`: this is the only command that
 * talks to the real ESI.
 *
 *   npm run smoke -- "Tritanium" "Hobgoblin I"
 */

import { appraise, createLiveMarket, HUBS } from "../src/market-core/index";

const names = process.argv.slice(2);

if (names.length === 0) {
  console.error('usage: npm run smoke -- "Tritanium" "Hobgoblin I"');
  process.exit(1);
}

function money(value: number | null): string {
  if (value === null) return "-";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return value.toFixed(2);
}

function cell(value: string, width: number): string {
  return value.length > width ? value.slice(0, width - 1) + "~" : value.padEnd(width);
}

function right(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value.padStart(width);
}

const started = Date.now();
const market = createLiveMarket();
const result = await appraise(names.join("\n"), market);
const elapsed = Date.now() - started;

const nameWidth = Math.min(
  24,
  Math.max(
    12,
    ...result.items.map((item) => item.name.length),
    "TOTAL buy / sell".length,
  ),
);
const hubWidth = 17;

const header = [
  cell("item", nameWidth),
  right("qty", 10),
  ...HUBS.map((hub) => cell(hub.label, hubWidth)),
].join(" | ");
const rule = [
  "-".repeat(nameWidth),
  "-".repeat(10),
  ...HUBS.map(() => "-".repeat(hubWidth)),
].join("-+-");

console.log(header);
console.log(rule);

for (const item of result.items) {
  const perHub = HUBS.map((hub) => {
    const book = item.hubs[hub.key];
    return cell(
      `${money(book.bestBuy?.price ?? null)} / ${money(book.bestSell?.price ?? null)}`,
      hubWidth,
    );
  });
  console.log(
    [cell(item.name, nameWidth), right(String(item.quantity), 10), ...perHub].join(" | "),
  );
}

console.log(rule);
const totals = HUBS.map((hub) => {
  const total = result.totals[hub.key];
  return cell(`${money(total.buy)} / ${money(total.sell)}`, hubWidth);
});
console.log([cell("TOTAL buy / sell", nameWidth), right("", 10), ...totals].join(" | "));

if (result.unresolved.length > 0) {
  console.log(`\nunresolved: ${result.unresolved.map((entry) => entry.name).join(", ")}`);
}
for (const rejected of result.rejected) {
  console.log(`line ${rejected.line} rejected: ${rejected.reason} (${rejected.raw})`);
}

console.log(`\n${result.items.length} item(s), ${elapsed} ms, ${market.cacheSize()} cached books`);
