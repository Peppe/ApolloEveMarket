"use server";

import {
  appraise,
  createLiveMarket,
  HUBS,
  parseInventory,
  type PriceMode,
} from "@/market-core";

/**
 * One market instance per server process: it owns the order cache, so every
 * visitor and every request shares one upstream fetch per (region, type) per
 * expiry window. Creating it per request would burn the rate budget.
 */
const market = createLiveMarket();

const MAX_TEXT_LENGTH = 20_000;
const MAX_ITEMS = 100;

export interface PriceCell {
  readonly buy: number | null;
  readonly sell: number | null;
}

export interface AppraiseRow {
  readonly name: string;
  readonly quantity: number;
  readonly cells: readonly PriceCell[];
}

export interface TotalsRow {
  readonly buy: number;
  readonly sell: number;
  readonly missingBuy: number;
  readonly missingSell: number;
}

export interface HubColumn {
  readonly key: string;
  readonly label: string;
  readonly scope: string;
}

/** Serializable shape the client renders. The core types never cross over. */
export interface AppraiseView {
  readonly mode: PriceMode;
  readonly hubs: readonly HubColumn[];
  readonly rows: readonly AppraiseRow[];
  readonly totals: readonly TotalsRow[];
  readonly rejected: readonly { line: number; raw: string; reason: string }[];
  readonly unresolved: readonly { name: string; quantity: number }[];
}

export interface AppraiseState {
  readonly status: "idle" | "ok" | "error";
  readonly message?: string;
  readonly view?: AppraiseView;
  readonly mode: PriceMode;
}

export async function appraiseAction(
  _previous: AppraiseState,
  formData: FormData,
): Promise<AppraiseState> {
  const text = String(formData.get("text") ?? "");
  const mode: PriceMode = formData.get("mode") === "system" ? "system" : "station";

  if (text.trim() === "") {
    return {
      status: "error",
      mode,
      message: "Paste an inventory or type at least one item name.",
    };
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return {
      status: "error",
      mode,
      message: `Input is limited to ${MAX_TEXT_LENGTH} characters.`,
    };
  }

  const parsed = parseInventory(text);
  if (parsed.items.length > MAX_ITEMS) {
    return {
      status: "error",
      mode,
      message: `Input is limited to ${MAX_ITEMS} distinct items.`,
    };
  }

  try {
    const result = await appraise(text, market, { priceMode: mode });

    const view: AppraiseView = {
      mode,
      hubs: HUBS.map((hub) => ({
        key: hub.key,
        label: hub.label,
        scope: mode === "station" ? hub.stationName : `${hub.label} solar system`,
      })),
      rows: result.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        cells: HUBS.map((hub) => {
          const book = item.hubs[hub.key];
          return {
            buy: book.bestBuy?.price ?? null,
            sell: book.bestSell?.price ?? null,
          };
        }),
      })),
      totals: HUBS.map((hub) => {
        const total = result.totals[hub.key];
        return {
          buy: total.buy,
          sell: total.sell,
          missingBuy: total.missingBuy,
          missingSell: total.missingSell,
        };
      }),
      rejected: result.rejected.map((entry) => ({
        line: entry.line,
        raw: entry.raw,
        reason: entry.reason,
      })),
      unresolved: result.unresolved.map((entry) => ({
        name: entry.name,
        quantity: entry.quantity,
      })),
    };

    return { status: "ok", view, mode };
  } catch (error) {
    return {
      status: "error",
      mode,
      message:
        error instanceof Error
          ? `Pricing failed: ${error.message}`
          : "Pricing failed for an unknown reason.",
    };
  }
}
