"use server";

import {
  appraise,
  createLiveMarket,
  HUBS,
  DEFAULT_CUSTOM_REGION,
  MAX_INVENTORY_ITEMS,
  MAX_INVENTORY_LENGTH,
  parseInventory,
  prepareOrderBook,
  type EsiMarketHistory,
  type HubKey,
  type MarketRegion,
  type OrderBook,
  type PriceMode,
} from "@/market-core";
import { historyScopeFor } from "./history-scope";
import { orderBookScopeFor } from "./order-book-scope";

/**
 * One market instance per server process: it owns the order cache, so every
 * visitor and every request shares one upstream fetch per (region, type) per
 * expiry window. Creating it per request would burn the rate budget.
 */
const market = createLiveMarket();

export interface PriceCell {
  readonly buy: number | null;
  readonly sell: number | null;
}

export interface AppraiseRow {
  readonly typeId: number;
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
  readonly key: HubKey | "custom";
  readonly label: string;
  readonly scope: string;
  readonly regionId: number;
}

/** Serializable shape the client renders. The core types never cross over. */
export interface AppraiseView {
  readonly mode: PriceMode;
  readonly customRegion: MarketRegion;
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

export type MarketHistoryResult =
  | {
      readonly status: "ok";
      readonly history: readonly EsiMarketHistory[];
      readonly scope: string;
      readonly regionId: number;
    }
  | {
      readonly status: "error";
      readonly message: string;
    };

export type MarketOrderBookResult =
  | {
      readonly status: "ok";
      readonly book: OrderBook;
      readonly scope: string;
    }
  | {
      readonly status: "error";
      readonly message: string;
    };

export type MarketRegionsResult =
  | { readonly status: "ok"; readonly regions: readonly MarketRegion[] }
  | { readonly status: "error"; readonly message: string };

export async function marketRegionsAction(): Promise<MarketRegionsResult> {
  try {
    return { status: "ok", regions: await market.getRegions() };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? `Region list failed: ${error.message}`
          : "Region list failed for an unknown reason.",
    };
  }
}

export async function marketHistoryAction(
  typeId: number,
  hubKey: HubKey | "custom",
  customRegionId?: number,
): Promise<MarketHistoryResult> {
  let customRegion: MarketRegion | undefined;
  if (hubKey === "custom") {
    if (!Number.isSafeInteger(customRegionId) || (customRegionId ?? 0) < 1) {
      return { status: "error", message: "Invalid custom market region." };
    }
    try {
      customRegion = (await market.getRegions()).find(
        (region) => region.id === customRegionId,
      );
    } catch (error) {
      return {
        status: "error",
        message:
          error instanceof Error
            ? `Region list failed: ${error.message}`
            : "Region list failed for an unknown reason.",
      };
    }
  }
  const scope = historyScopeFor(typeId, hubKey, customRegion);
  if (scope === null) {
    return { status: "error", message: "Invalid item or market region." };
  }

  try {
    const history = await market.getHistory(scope.regionId, typeId);
    return {
      status: "ok",
      history,
      regionId: scope.regionId,
      scope: scope.label,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? `History failed: ${error.message}`
          : "History failed for an unknown reason.",
    };
  }
}

export async function marketOrderBookAction(
  typeId: number,
  hubKey: HubKey | "custom",
  mode: PriceMode,
  customRegionId?: number,
): Promise<MarketOrderBookResult> {
  if (mode !== "region" && mode !== "system" && mode !== "station") {
    return { status: "error", message: "Invalid market price scope." };
  }

  let customRegion: MarketRegion | undefined;
  if (hubKey === "custom" && typeId !== 44992) {
    if (!Number.isSafeInteger(customRegionId) || (customRegionId ?? 0) < 1) {
      return { status: "error", message: "Invalid custom market region." };
    }
    try {
      customRegion = (await market.getRegions()).find(
        (region) => region.id === customRegionId,
      );
    } catch (error) {
      return {
        status: "error",
        message:
          error instanceof Error
            ? `Region list failed: ${error.message}`
            : "Region list failed for an unknown reason.",
      };
    }
  }

  const scope = orderBookScopeFor(typeId, hubKey, mode, customRegion);
  if (scope === null) {
    return { status: "error", message: "Invalid item or market scope." };
  }

  try {
    const orders = await market.getOrders(scope.regionId, typeId);
    return {
      status: "ok",
      book: prepareOrderBook(
        orders,
        { systemId: scope.systemId, stationId: scope.stationId },
        Date.now(),
      ),
      scope: scope.label,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? `Order book failed: ${error.message}`
          : "Order book failed for an unknown reason.",
    };
  }
}

export async function appraiseAction(
  _previous: AppraiseState,
  formData: FormData,
): Promise<AppraiseState> {
  const text = String(formData.get("text") ?? "");
  const rawMode = formData.get("mode");
  const mode: PriceMode =
    rawMode === "system" || rawMode === "station" || rawMode === "region"
      ? rawMode
      : "region";

  if (text.trim() === "") {
    return {
      status: "error",
      mode,
      message: "Paste an inventory or type at least one item name.",
    };
  }

  if (text.length > MAX_INVENTORY_LENGTH) {
    return {
      status: "error",
      mode,
      message: `Input is limited to ${MAX_INVENTORY_LENGTH} characters.`,
    };
  }

  const parsed = parseInventory(text);
  if (parsed.items.length > MAX_INVENTORY_ITEMS) {
    return {
      status: "error",
      mode,
      message: `Input is limited to ${MAX_INVENTORY_ITEMS} distinct items.`,
    };
  }

  try {
    const rawRegionId = formData.get("customRegionId");
    const customRegionId =
      typeof rawRegionId === "string" && rawRegionId !== ""
        ? Number(rawRegionId)
        : DEFAULT_CUSTOM_REGION.id;
    if (!Number.isSafeInteger(customRegionId) || customRegionId < 1) {
      return {
        status: "error",
        mode,
        message: "Choose a valid custom market region.",
      };
    }
    const customRegion = (await market.getRegions()).find(
      (region) => region.id === customRegionId,
    );
    if (customRegion === undefined) {
      return {
        status: "error",
        mode,
        message: "Choose a region from the available market regions.",
      };
    }
    const result = await appraise(text, market, {
      priceMode: mode,
      customRegion,
    });

    const view: AppraiseView = {
      mode,
      customRegion,
      hubs: [
        ...HUBS.map((hub) => ({
          key: hub.key,
          label: hub.label,
          scope:
            mode === "region"
              ? `${hub.label} region`
              : mode === "station"
                ? hub.stationName
                : `${hub.label} solar system`,
          regionId: hub.regionId,
        })),
        {
          key: "custom",
          label: customRegion.name,
          scope: `${customRegion.name} region`,
          regionId: customRegion.id,
        },
      ],
      rows: result.items.map((item) => ({
        typeId: item.typeId,
        name: item.name,
        quantity: item.quantity,
        cells: [
          ...HUBS.map((hub) => {
            const book = item.hubs[hub.key];
            return {
              buy: book.bestBuy?.price ?? null,
              sell: book.bestSell?.price ?? null,
            };
          }),
          {
            buy: item.custom.bestBuy?.price ?? null,
            sell: item.custom.bestSell?.price ?? null,
          },
        ],
      })),
      totals: [
        ...HUBS.map((hub) => {
          const total = result.totals[hub.key];
          return {
            buy: total.buy,
            sell: total.sell,
            missingBuy: total.missingBuy,
            missingSell: total.missingSell,
          };
        }),
        {
          buy: result.customTotal.buy,
          sell: result.customTotal.sell,
          missingBuy: result.customTotal.missingBuy,
          missingSell: result.customTotal.missingSell,
        },
      ],
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
