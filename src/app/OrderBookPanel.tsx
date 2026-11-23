"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { HubKey, OrderBookRow, PriceMode } from "@/market-core";
import {
  marketOrderBookAction,
  type MarketOrderBookResult,
} from "./actions";
import {
  MarketPanelHost,
  type MarketPanelMode,
} from "./MarketPanelHost";

interface OrderBookPanelProps {
  readonly panelId: string;
  readonly typeId: number;
  readonly itemName: string;
  readonly hubKey: HubKey | "custom";
  readonly mode: PriceMode;
  readonly customRegionId?: number;
  readonly panelMode: MarketPanelMode;
  readonly onPanelModeChange: (mode: MarketPanelMode) => void;
}

type DepthStyle = CSSProperties & { "--depth": string };

function formatIsk(value: number): string {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} ISK`;
}

function formatQuantity(value: number): string {
  return value.toLocaleString("en-US");
}

function formatDuration(milliseconds: number): string {
  if (milliseconds <= 0) return "Expired";
  if (milliseconds < 60_000) return "<1m";

  const totalMinutes = Math.floor(milliseconds / 60_000);
  const minutes = totalMinutes % 60;
  const totalHours = Math.floor(totalMinutes / 60);
  const hours = totalHours % 24;
  const days = Math.floor(totalHours / 24);
  if (days > 0) return `${days}d ${hours}h`;
  if (totalHours > 0) return `${totalHours}h ${minutes}m`;
  return `${minutes}m`;
}

function BookSide({
  side,
  rows,
  total,
  locations,
}: {
  readonly side: "buy" | "sell";
  readonly rows: readonly OrderBookRow[];
  readonly total: number;
  readonly locations: Readonly<Record<number, string>>;
}) {
  const title = side === "buy" ? "Buy orders" : "Sell orders";
  return (
    <section className={`order-book-side order-book-${side}`}>
      <header className="order-book-side-header">
        <h4>{title}</h4>
        <span>
          {rows.length.toLocaleString("en-US")} orders /{" "}
          {formatQuantity(total)} items
        </span>
      </header>
      {rows.length === 0 ? (
        <p className="history-message">No {side} orders in this scope.</p>
      ) : (
        <div className="order-book-table-wrap">
          <table aria-label={title}>
            <thead>
              <tr>
                <th scope="col">Price</th>
                <th scope="col">Quantity</th>
                <th scope="col">Cumulative</th>
                <th scope="col">Age</th>
                <th scope="col">Time left</th>
                <th scope="col">Location</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const depth = Math.max(0, Math.min(1, row.depthFraction));
                const style: DepthStyle = { "--depth": `${depth * 100}%` };
                const locationName =
                  locations[row.locationId] ??
                  (row.locationId > 2_147_483_647
                    ? `Structure ${row.locationId}`
                    : `Location ${row.locationId}`);
                return (
                  <tr
                    className="order-book-row"
                    key={row.orderId}
                    style={style}
                  >
                    <td>{formatIsk(row.price)}</td>
                    <td>{formatQuantity(row.volumeRemain)}</td>
                    <td>{formatQuantity(row.cumulativeQuantity)}</td>
                    <td>
                      <time
                        dateTime={new Date(row.issuedAt).toISOString()}
                        title={`Issued ${new Date(row.issuedAt).toLocaleString()}`}
                      >
                        {formatDuration(row.ageMs)}
                      </time>
                    </td>
                    <td>
                      <time
                        dateTime={new Date(row.expiresAt).toISOString()}
                        title={`Expires ${new Date(row.expiresAt).toLocaleString()}`}
                      >
                        {formatDuration(row.remainingMs)}
                      </time>
                    </td>
                    <td
                      className="order-book-location"
                      title={locationName}
                    >
                      {locationName}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function OrderBookPanel({
  panelId,
  typeId,
  itemName,
  hubKey,
  mode,
  customRegionId,
  panelMode,
  onPanelModeChange,
}: OrderBookPanelProps) {
  const [result, setResult] = useState<MarketOrderBookResult | null>(null);

  useEffect(() => {
    let active = true;
    setResult(null);
    void marketOrderBookAction(typeId, hubKey, mode, customRegionId)
      .then((response) => {
        if (active) setResult(response);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setResult({
          status: "error",
          message:
            error instanceof Error
              ? `Order book failed: ${error.message}`
              : "Order book failed for an unknown reason.",
        });
      });
    return () => {
      active = false;
    };
  }, [typeId, hubKey, mode, customRegionId]);

  return (
    <MarketPanelHost
      panelId={panelId}
      title={`${itemName} order book`}
      scope={result?.status === "ok" ? result.scope : undefined}
      mode={panelMode}
      onModeChange={onPanelModeChange}
    >
      {result === null && (
        <p className="history-message" role="status" aria-live="polite">
          Loading market orders...
        </p>
      )}
      {result?.status === "error" && (
        <p className="error" role="alert">{result.message}</p>
      )}
      {result?.status === "ok" &&
        result.book.buy.length === 0 &&
        result.book.sell.length === 0 && (
          <p className="history-message" role="status">
            No market orders are available for this item in this scope.
          </p>
        )}
      {result?.status === "ok" &&
        (result.book.buy.length > 0 || result.book.sell.length > 0) && (
          <div className="order-book-grid">
            <BookSide
              side="buy"
              rows={result.book.buy}
              total={result.book.buyTotal}
              locations={result.locations}
            />
            <BookSide
              side="sell"
              rows={result.book.sell}
              total={result.book.sellTotal}
              locations={result.locations}
            />
          </div>
        )}
    </MarketPanelHost>
  );
}
