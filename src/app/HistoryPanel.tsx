"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  BarController,
  BarElement,
  Chart as ChartJS,
  type ChartConfigurationCustomTypesPerDataset,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import {
  aggregateHistory,
  defaultHistoryRange,
  type EsiMarketHistory,
  type HistoryRangeBar,
  type HistoryUnit,
  type HubKey,
} from "@/market-core";
import {
  marketHistoryAction,
  type MarketHistoryResult,
} from "./actions";
import {
  formatHistoryTooltipPrice,
  historyTrend,
  showAverageMarker,
} from "./history-chart";
import { MarketPanelHost } from "./MarketPanelHost";

ChartJS.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
);

const SETTINGS_KEY = "apolloeve-chart-settings";
const DAY_MS = 24 * 60 * 60 * 1000;

interface ChartSettings {
  readonly unit: HistoryUnit;
  readonly startDate: string;
  readonly endDate: string;
  readonly panelMode: "history";
}

interface HistoryPanelProps {
  readonly panelId: string;
  readonly typeId: number;
  readonly itemName: string;
  readonly hubKey: HubKey;
}

const DEFAULT_SETTINGS: ChartSettings = {
  unit: "day",
  startDate: "",
  endDate: "",
  panelMode: "history",
};

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
}

function isHistoryUnit(value: unknown): value is HistoryUnit {
  return (
    value === "day" ||
    value === "3-days" ||
    value === "week" ||
    value === "month"
  );
}

function parseSettings(value: string | null): ChartSettings {
  if (value === null) return DEFAULT_SETTINGS;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_SETTINGS;
    const data = parsed as Record<string, unknown>;
    const unit = isHistoryUnit(data.unit) ? data.unit : DEFAULT_SETTINGS.unit;
    return {
      unit,
      startDate: isDate(data.startDate) ? data.startDate : "",
      endDate: isDate(data.endDate) ? data.endDate : "",
      panelMode: "history",
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function getHistoryBounds(
  rows: readonly EsiMarketHistory[],
): { earliest: string; latest: string } | null {
  if (rows.length === 0) return null;
  const dates = rows.map((row) => row.date).sort();
  const earliest = dates[0];
  const latest = dates[dates.length - 1];
  return earliest === undefined || latest === undefined
    ? null
    : { earliest, latest };
}

function availableRange(
  rows: readonly EsiMarketHistory[],
  settings: ChartSettings,
): { startDate: string; endDate: string } | null {
  const bounds = getHistoryBounds(rows);
  const defaultRange = defaultHistoryRange(rows);
  if (bounds === null || defaultRange === null) return null;

  if (!settings.startDate || !settings.endDate) return defaultRange;
  if (settings.endDate < bounds.earliest || settings.startDate > bounds.latest) {
    return defaultRange;
  }
  const startDate =
    settings.startDate < bounds.earliest ? bounds.earliest : settings.startDate;
  const endDate =
    settings.endDate > bounds.latest ? bounds.latest : settings.endDate;
  return startDate > endDate ? defaultRange : { startDate, endDate };
}

function formatPrice(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCompactPrice(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(2);
}

function formatVolume(value: number): string {
  return value.toLocaleString("en-US");
}

function formatCompactVolume(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function dateTimestamp(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function barThickness(startDate: string, endDate: string, unit: HistoryUnit): number {
  const unitDays: Record<HistoryUnit, number> = {
    day: 1,
    "3-days": 3,
    week: 7,
    month: 30,
  };
  const visibleDays =
    (dateTimestamp(endDate) - dateTimestamp(startDate)) / DAY_MS + 1;
  const expectedBars = Math.max(1, visibleDays / unitDays[unit]);
  return Math.max(1, Math.min(7, (700 / expectedBars) * 0.55));
}

function trendColor(points: readonly HistoryRangeBar[], index: number): string {
  const trend = historyTrend(points, index);
  if (trend === "up") return "#3ee08f";
  if (trend === "down") return "#ff6b73";
  return "#c2b5cb";
}

function trendFill(points: readonly HistoryRangeBar[], index: number): string {
  const trend = historyTrend(points, index);
  if (trend === "up") return "rgba(62, 224, 143, 0.28)";
  if (trend === "down") return "rgba(255, 107, 115, 0.28)";
  return "rgba(194, 181, 203, 0.2)";
}

function volumeTrendFill(
  points: readonly HistoryRangeBar[],
  index: number,
): string {
  const trend = historyTrend(points, index);
  if (trend === "up") return "rgba(62, 224, 143, 0.5)";
  if (trend === "down") return "rgba(255, 107, 115, 0.5)";
  return "rgba(194, 181, 203, 0.35)";
}

function chartOptions(
  startDate: string,
  endDate: string,
  showDateLabels: boolean,
) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    interaction: { intersect: false, mode: "index" as const },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#21192b",
        borderColor: "#3d3049",
        borderWidth: 1,
        titleColor: "#f4edf7",
        bodyColor: "#c2b5cb",
        callbacks: {
          title: (items: { parsed: { x: number | null } }[]) =>
            items[0]?.parsed.x == null
              ? ""
              : new Date(items[0].parsed.x).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  timeZone: "UTC",
                }),
        },
      },
    },
    scales: {
      x: {
        type: "linear" as const,
        min: dateTimestamp(startDate),
        max: dateTimestamp(endDate) + DAY_MS - 1,
        grid: { color: "rgba(61, 48, 73, 0.45)" },
        ticks: {
          display: showDateLabels,
          color: "#9b8da5",
          maxTicksLimit: 8,
          callback: (value: string | number) =>
            new Date(Number(value)).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            }),
        },
      },
    },
  };
}

function PriceRangeChart({
  canvasRef,
  points,
  startDate,
  endDate,
  unit,
}: {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
  readonly points: readonly HistoryRangeBar[];
  readonly startDate: string;
  readonly endDate: string;
  readonly unit: HistoryUnit;
}) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    type MixedChartPoint = { x: number; y: number | [number, number] };
    const baseOptions = chartOptions(startDate, endDate, false);
    const config: ChartConfigurationCustomTypesPerDataset<
      "bar" | "line",
      MixedChartPoint[],
      string
    > = {
      data: {
        datasets: [
          {
            type: "bar",
            label: "High-low range",
            data: points.map((point) => ({
              x: dateTimestamp(point.date),
              y: [point.lowest, point.highest],
            })),
            barThickness: barThickness(startDate, endDate, unit),
            backgroundColor: points.map((_, index) => trendFill(points, index)),
            borderWidth: 0,
          },
          {
            type: "line",
            label: "Average",
            data: points.map((point) => ({
              x: dateTimestamp(point.date),
              y: point.average,
            })),
            showLine: false,
            pointStyle: "circle",
            pointRadius: (context) =>
              showAverageMarker(points.length, context.dataIndex) ? 3.5 : 0,
            pointHoverRadius: 5,
            pointHitRadius: 4,
            pointBorderWidth: 0,
            pointBackgroundColor: points.map((_, index) =>
              trendColor(points, index),
            ),
          },
        ],
      },
      options: {
        ...baseOptions,
        plugins: {
          ...baseOptions.plugins,
          tooltip: {
            ...baseOptions.plugins.tooltip,
            filter: (context) => context.datasetIndex === 0,
            callbacks: {
              ...baseOptions.plugins.tooltip.callbacks,
              label: (context) => {
                const point = points[context.dataIndex];
                if (point === undefined) return [];
                return [
                  `High: ${formatHistoryTooltipPrice(point.highest)}`,
                  `Average: ${formatHistoryTooltipPrice(point.average)}`,
                  `Low: ${formatHistoryTooltipPrice(point.lowest)}`,
                ];
              },
            },
          },
        },
        scales: {
          ...baseOptions.scales,
          y: {
            afterFit: (scale) => {
              scale.width = 64;
            },
            beginAtZero: false,
            grid: { color: "rgba(61, 48, 73, 0.45)" },
            ticks: {
              color: "#9b8da5",
              callback: (value: string | number) =>
                formatCompactPrice(Number(value)),
            },
          },
        },
      },
    };
    const chart = new ChartJS(canvas, config);

    return () => chart.destroy();
  }, [canvasRef, points, startDate, endDate, unit]);

  return (
    <div className="history-price-chart">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Market price ranges from low to high, with a filled circle at each average. Green means the average rose from the previous period; red means it fell."
      />
    </div>
  );
}

function VolumeChart({
  canvasRef,
  points,
  startDate,
  endDate,
  unit,
}: {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
  readonly points: readonly HistoryRangeBar[];
  readonly startDate: string;
  readonly endDate: string;
  readonly unit: HistoryUnit;
}) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    const chart = new ChartJS(canvas, {
      type: "bar",
      data: {
        datasets: [
          {
            label: "Volume",
            data: points.map((point) => ({
              x: dateTimestamp(point.date),
              y: point.volume,
            })),
            barThickness: barThickness(startDate, endDate, unit),
            backgroundColor: points.map((_, index) =>
              volumeTrendFill(points, index),
            ),
            borderWidth: 0,
          },
        ],
      },
      options: {
        ...chartOptions(startDate, endDate, true),
        scales: {
          ...chartOptions(startDate, endDate, true).scales,
          y: {
            afterFit: (scale) => {
              scale.width = 64;
            },
            beginAtZero: true,
            grid: { color: "rgba(61, 48, 73, 0.35)" },
            ticks: {
              color: "#9b8da5",
              maxTicksLimit: 4,
              callback: (value: string | number) =>
                formatCompactVolume(Number(value)),
            },
          },
        },
      },
    });

    return () => chart.destroy();
  }, [canvasRef, points, startDate, endDate, unit]);

  return (
    <div className="history-volume-chart">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Traded volume, using the same date range as the price chart."
      />
    </div>
  );
}

export function HistoryPanel({
  panelId,
  typeId,
  itemName,
  hubKey,
}: HistoryPanelProps) {
  const [result, setResult] = useState<MarketHistoryResult | null>(null);
  const [settings, setSettings] = useState<ChartSettings>(DEFAULT_SETTINGS);
  const [settingsReady, setSettingsReady] = useState(false);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const priceCanvasRef = useRef<HTMLCanvasElement>(null);
  const volumeCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    try {
      setSettings(parseSettings(window.localStorage.getItem(SETTINGS_KEY)));
    } catch {
      setStorageUnavailable(true);
    } finally {
      setSettingsReady(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    setResult(null);
    void marketHistoryAction(typeId, hubKey)
      .then((response) => {
        if (active) setResult(response);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setResult({
          status: "error",
          message:
            error instanceof Error
              ? `History failed: ${error.message}`
              : "History failed for an unknown reason.",
        });
      });
    return () => {
      active = false;
    };
  }, [typeId, hubKey]);

  useEffect(() => {
    if (!settingsReady || result?.status !== "ok") return;
    const range = availableRange(result.history, settings);
    if (range === null) return;
    if (
      settings.startDate !== range.startDate ||
      settings.endDate !== range.endDate
    ) {
      setSettings((current) => ({
        ...current,
        startDate: range.startDate,
        endDate: range.endDate,
      }));
    }
  }, [settingsReady, result, settings]);

  useEffect(() => {
    if (!settingsReady || storageUnavailable) return;
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      setStorageUnavailable(true);
    }
  }, [settings, settingsReady, storageUnavailable]);

  const range = useMemo(
    () =>
      result?.status === "ok" ? availableRange(result.history, settings) : null,
    [result, settings.startDate, settings.endDate],
  );
  const points = useMemo(
    () =>
      result?.status === "ok" && range !== null
        ? aggregateHistory(
            result.history,
            settings.unit,
            range.startDate,
            range.endDate,
          )
        : [],
    [result, range, settings.unit],
  );
  const bounds = result?.status === "ok" ? getHistoryBounds(result.history) : null;

  function updateUnit(unit: HistoryUnit) {
    setSettings((current) => ({ ...current, unit }));
  }

  function updateStartDate(startDate: string) {
    if (!isDate(startDate)) return;
    setSettings((current) => ({
      ...current,
      startDate,
      endDate: startDate > current.endDate ? startDate : current.endDate,
    }));
  }

  function updateEndDate(endDate: string) {
    if (!isDate(endDate)) return;
    setSettings((current) => ({
      ...current,
      startDate: endDate < current.startDate ? endDate : current.startDate,
      endDate,
    }));
  }

  function chooseRange(days: number | null) {
    if (bounds === null) return;
    const end = dateTimestamp(bounds.latest);
    const start =
      days === null
        ? dateTimestamp(bounds.earliest)
        : Math.max(dateTimestamp(bounds.earliest), end - (days - 1) * DAY_MS);
    setSettings((current) => ({
      ...current,
      startDate: new Date(start).toISOString().slice(0, 10),
      endDate: bounds.latest,
    }));
  }

  return (
    <MarketPanelHost
      panelId={panelId}
      title={`${itemName} market history`}
      scope={result?.status === "ok" ? result.scope : undefined}
    >
      {result === null && (
        <p className="history-message" role="status" aria-live="polite">
          Loading market history...
        </p>
      )}
      {result?.status === "error" && (
        <p className="error" role="alert">{result.message}</p>
      )}
      {result?.status === "ok" && result.history.length === 0 && (
        <p className="history-message" role="status">
          No market history is available for this item.
        </p>
      )}
      {result?.status === "ok" && result.history.length > 0 && range !== null && (
        <>
          <div className="history-controls">
            <label>
              Candle size
              <select
                value={settings.unit}
                onChange={(event) => {
                  if (isHistoryUnit(event.target.value)) {
                    updateUnit(event.target.value);
                  }
                }}
              >
                <option value="day">1 day</option>
                <option value="3-days">3 days</option>
                <option value="week">1 week</option>
                <option value="month">1 month</option>
              </select>
            </label>
            <label>
              Range
              <select
                value=""
                onChange={(event) => {
                  const preset = event.target.value;
                  if (preset === "all") chooseRange(null);
                  else if (preset !== "") chooseRange(Number(preset));
                }}
              >
                <option value="">Choose range</option>
                <option value="30">1 month</option>
                <option value="90">3 months</option>
                <option value="180">6 months</option>
                <option value="365">1 year</option>
                <option value="all">All available</option>
              </select>
            </label>
            <label>
              From
              <input
                type="date"
                min={bounds?.earliest}
                max={range.endDate}
                value={range.startDate}
                onChange={(event) => updateStartDate(event.target.value)}
              />
            </label>
            <label>
              To
              <input
                type="date"
                min={range.startDate}
                max={bounds?.latest}
                value={range.endDate}
                onChange={(event) => updateEndDate(event.target.value)}
              />
            </label>
          </div>
          {storageUnavailable && (
            <p className="history-message">
              Browser storage is unavailable; chart settings will not be remembered.
            </p>
          )}
          {points.length === 0 ? (
            <p className="history-message">No history observations in this date range.</p>
          ) : (
            <>
              <div className="history-chart-label">
                <strong>Price range</strong>
                <span className="history-chart-legend">
                  <span><i className="trend-swatch trend-up" />Price up</span>
                  <span><i className="trend-swatch trend-down" />Price down</span>
                  <span><i className="trend-swatch trend-average" />Average</span>
                  <span>Compared with the previous period</span>
                </span>
              </div>
              <PriceRangeChart
                canvasRef={priceCanvasRef}
                points={points}
                startDate={range.startDate}
                endDate={range.endDate}
                unit={settings.unit}
              />
              <div className="history-chart-label volume-label">
                <strong>Volume</strong>
                <span>Items traded</span>
              </div>
              <VolumeChart
                canvasRef={volumeCanvasRef}
                points={points}
                startDate={range.startDate}
                endDate={range.endDate}
                unit={settings.unit}
              />
              <details className="history-data">
                <summary>View plotted data</summary>
                <div className="history-data-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Low</th>
                        <th>Average</th>
                        <th>High</th>
                        <th>Volume</th>
                      </tr>
                    </thead>
                    <tbody>
                      {points.map((point) => (
                        <tr key={point.date}>
                          <th scope="row">{point.date}</th>
                          <td>{formatPrice(point.lowest)}</td>
                          <td>{formatPrice(point.average)}</td>
                          <td>{formatPrice(point.highest)}</td>
                          <td>{formatVolume(point.volume)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          )}
        </>
      )}
    </MarketPanelHost>
  );
}
