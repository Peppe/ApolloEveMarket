import type { HistoryRangeBar } from "../market-core";

export type HistoryTrend = "up" | "down" | "flat";

const MAX_AVERAGE_MARKERS = 120;

export function historyTrend(
  points: readonly HistoryRangeBar[],
  index: number,
): HistoryTrend {
  const current = points[index];
  const previous = points[index - 1];
  if (current === undefined || previous === undefined) return "flat";
  if (current.average > previous.average) return "up";
  if (current.average < previous.average) return "down";
  return "flat";
}

export function showAverageMarker(pointCount: number, index: number): boolean {
  if (pointCount <= MAX_AVERAGE_MARKERS) return true;
  const stride = Math.ceil(pointCount / MAX_AVERAGE_MARKERS);
  return index % stride === 0 || index === pointCount - 1;
}

export function formatHistoryTooltipPrice(value: number): string {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} ISK`;
}
