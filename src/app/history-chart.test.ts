import { describe, expect, it } from "vitest";
import type { HistoryRangeBar } from "../market-core";
import {
  formatHistoryTooltipPrice,
  historyTrend,
  showAverageMarker,
} from "./history-chart";

const points: HistoryRangeBar[] = [
  { date: "2026-01-01", average: 10, highest: 12, lowest: 8, orderCount: 1, volume: 2 },
  { date: "2026-01-02", average: 11, highest: 13, lowest: 9, orderCount: 1, volume: 2 },
  { date: "2026-01-03", average: 9, highest: 11, lowest: 7, orderCount: 1, volume: 2 },
  { date: "2026-01-04", average: 9, highest: 11, lowest: 7, orderCount: 1, volume: 2 },
];

describe("history chart presentation", () => {
  it("compares each average with the previous plotted period", () => {
    expect(historyTrend(points, 0)).toBe("flat");
    expect(historyTrend(points, 1)).toBe("up");
    expect(historyTrend(points, 2)).toBe("down");
    expect(historyTrend(points, 3)).toBe("flat");
  });

  it("shows all average markers until the chart becomes dense", () => {
    expect(showAverageMarker(120, 119)).toBe(true);
    expect(showAverageMarker(414, 0)).toBe(true);
    expect(showAverageMarker(414, 1)).toBe(false);
    expect(showAverageMarker(414, 413)).toBe(true);
  });

  it("formats tooltip prices as comma-separated ISK values", () => {
    expect(formatHistoryTooltipPrice(95030000)).toBe("95,030,000 ISK");
    expect(formatHistoryTooltipPrice(95030000.5)).toBe("95,030,000.5 ISK");
  });
});
