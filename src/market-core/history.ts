import type { EsiMarketHistory } from "./esi-types";

export type HistoryUnit = "day" | "3-days" | "week" | "month";

export interface HistoryRangeBar {
  readonly date: string;
  readonly average: number;
  readonly highest: number;
  readonly lowest: number;
  readonly orderCount: number;
  readonly volume: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayStart(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function bucketDate(date: string, unit: HistoryUnit): string {
  const timestamp = dayStart(date);
  const current = new Date(timestamp);

  if (unit === "day") return date;
  if (unit === "month") {
    return new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1))
      .toISOString()
      .slice(0, 10);
  }
  if (unit === "week") {
    const weekdayFromMonday = (current.getUTCDay() + 6) % 7;
    return new Date(timestamp - weekdayFromMonday * DAY_MS)
      .toISOString()
      .slice(0, 10);
  }

  const yearStart = Date.UTC(current.getUTCFullYear(), 0, 1);
  const dayOffset = Math.floor((timestamp - yearStart) / DAY_MS);
  return new Date(yearStart + Math.floor(dayOffset / 3) * 3 * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * Aggregate daily ESI observations into range bars. The center marker is the
 * unweighted mean of daily averages because ESI does not provide daily
 * volume-weighted prices. Missing days are not filled or copied forward.
 */
export function aggregateHistory(
  history: readonly EsiMarketHistory[],
  unit: HistoryUnit,
  startDate?: string,
  endDate?: string,
): HistoryRangeBar[] {
  const filtered = history
    .filter(
      (row) =>
        (startDate === undefined || row.date >= startDate) &&
        (endDate === undefined || row.date <= endDate),
    )
    .slice()
    .sort((left, right) => left.date.localeCompare(right.date));
  const groups = new Map<
    string,
    {
      averages: number[];
      firstDate: string;
      highest: number;
      lowest: number;
      orderCount: number;
      volume: number;
    }
  >();

  for (const row of filtered) {
    const date = bucketDate(row.date, unit);
    const group = groups.get(date);
    if (group === undefined) {
      groups.set(date, {
        averages: [row.average],
        firstDate: row.date,
        highest: row.highest,
        lowest: row.lowest,
        orderCount: row.order_count,
        volume: row.volume,
      });
      continue;
    }

    group.averages.push(row.average);
    group.highest = Math.max(group.highest, row.highest);
    group.lowest = Math.min(group.lowest, row.lowest);
    group.orderCount += row.order_count;
    group.volume += row.volume;
  }

  return Array.from(groups.values(), (group) => ({
    date: group.firstDate,
    average:
      group.averages.reduce((total, value) => total + value, 0) /
      group.averages.length,
    highest: group.highest,
    lowest: group.lowest,
    orderCount: group.orderCount,
    volume: group.volume,
  }));
}

export function defaultHistoryRange(
  history: readonly EsiMarketHistory[],
): { startDate: string; endDate: string } | null {
  if (history.length === 0) return null;
  const dates = history.map((row) => row.date).sort();
  const endDate = dates[dates.length - 1];
  const earliest = dates[0];
  if (endDate === undefined || earliest === undefined) return null;

  const oneYearBefore = new Date(`${endDate}T00:00:00Z`);
  oneYearBefore.setUTCFullYear(oneYearBefore.getUTCFullYear() - 1);
  const startDate = oneYearBefore.toISOString().slice(0, 10);
  return { startDate: startDate < earliest ? earliest : startDate, endDate };
}
