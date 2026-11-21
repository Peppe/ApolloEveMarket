import { describe, expect, it } from "vitest";
import type { EsiMarketHistory } from "./esi-types";
import { aggregateHistory, defaultHistoryRange } from "./history";
import { readFixtureJson } from "./testing/fixtures";

const history = readFixtureJson<EsiMarketHistory[]>("history-forge-tritanium");

describe("aggregateHistory", () => {
  it("preserves each daily high/low/average and volume", () => {
    const daily = aggregateHistory(history, "day");

    expect(daily).toHaveLength(history.length);
    expect(daily[0]).toMatchObject({
      date: history[0]?.date,
      average: history[0]?.average,
      highest: history[0]?.highest,
      lowest: history[0]?.lowest,
      volume: history[0]?.volume,
    });
  });

  it("groups three-day periods using an arithmetic daily-average mean", () => {
    const data: EsiMarketHistory[] = [
      { date: "2026-01-01", average: 2, highest: 4, lowest: 1, order_count: 2, volume: 10 },
      { date: "2026-01-02", average: 4, highest: 5, lowest: 2, order_count: 3, volume: 20 },
      { date: "2026-01-03", average: 6, highest: 8, lowest: 3, order_count: 4, volume: 30 },
      { date: "2026-01-04", average: 8, highest: 9, lowest: 7, order_count: 5, volume: 40 },
    ];

    expect(aggregateHistory(data, "3-days")).toEqual([
      {
        date: "2026-01-01",
        average: 4,
        highest: 8,
        lowest: 1,
        orderCount: 9,
        volume: 60,
      },
      {
        date: "2026-01-04",
        average: 8,
        highest: 9,
        lowest: 7,
        orderCount: 5,
        volume: 40,
      },
    ]);
  });

  it("groups by UTC week and calendar month and leaves missing days absent", () => {
    const data: EsiMarketHistory[] = [
      { date: "2026-02-01", average: 1, highest: 2, lowest: 0.5, order_count: 1, volume: 5 },
      { date: "2026-02-03", average: 3, highest: 4, lowest: 2, order_count: 2, volume: 7 },
      { date: "2026-02-08", average: 5, highest: 6, lowest: 4, order_count: 3, volume: 11 },
    ];

    expect(aggregateHistory(data, "week").map((row) => row.date)).toEqual([
      "2026-02-01",
      "2026-02-03",
    ]);
    expect(aggregateHistory(data, "month")).toHaveLength(1);
    expect(aggregateHistory(data, "month")[0]?.volume).toBe(23);
  });

  it("filters requested date bounds and defaults to the latest year of data", () => {
    const bounded = aggregateHistory(
      history,
      "day",
      history[1]?.date,
      history[2]?.date,
    );
    expect(bounded).toHaveLength(2);

    const range = defaultHistoryRange(history);
    expect(history).toHaveLength(414);
    expect(range).toEqual({
      startDate: "2025-11-18",
      endDate: "2026-11-18",
    });
  });

  it("returns no default range for an empty history", () => {
    expect(defaultHistoryRange([])).toBeNull();
  });
});
