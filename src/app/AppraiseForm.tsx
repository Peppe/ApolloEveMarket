"use client";

import { Fragment, useActionState, useEffect, useRef, useState } from "react";
import {
  appraiseAction,
  marketRegionsAction,
  type AppraiseState,
  type AppraiseView,
} from "./actions";
import { HistoryPanel } from "./HistoryPanel";
import {
  MAX_INVENTORY_ITEMS,
  DEFAULT_CUSTOM_REGION,
  parseInventory,
  type HubKey,
  type MarketRegion,
} from "@/market-core";
import { priceRank } from "./price-rank";
import {
  decodeSharedAppraisal,
  encodeSharedAppraisal,
  MAX_SHARED_TEXT_LENGTH,
} from "./share-link";

const initialState: AppraiseState = { status: "idle", mode: "region" };
const SAMPLE_TEXT = "Tritanium 1000000\nHobgoblin I 10\nIshtar 1";
const LAST_APPRAISAL_KEY = "apolloeve-last-appraisal";
const CUSTOM_REGION_KEY = "apolloeve-custom-region";

type Mode = "region" | "station" | "system";

interface HistorySelection {
  readonly typeId: number;
  readonly itemName: string;
  readonly hubKey: HubKey | "custom";
  readonly customRegionId?: number;
}

function isk(value: number | null): string {
  if (value === null) return "-";
  if (value < 1000) return value.toFixed(2);
  return Math.round(value).toLocaleString("en-US");
}

function priceRankClass(
  value: number | null,
  prices: readonly (number | null)[],
): string {
  const rank = priceRank(value, prices);
  return rank === null ? "muted" : `price-rank-${rank}`;
}

function scopeNote(view: AppraiseView): string {
  const customRegion = `${view.customRegion.name} region`;
  if (view.mode === "region") {
    return `Every order in each hub's region, and the ${customRegion}.`;
  }
  if (view.mode === "station") {
    const jita = view.hubs[0]?.scope ?? "";
    return `Fixed hub columns use their primary stations, for example ${jita}; the custom column uses the ${customRegion}.`;
  }
  return `Fixed hub columns use each solar system, including structures; the custom column uses the ${customRegion}.`;
}

function Results({
  view,
  regions,
  onSelectRegion,
  onResetRegion,
  openHistory,
  onSelectHistory,
}: {
  readonly view: AppraiseView;
  readonly regions: readonly MarketRegion[];
  readonly onSelectRegion: (region: MarketRegion) => void;
  readonly onResetRegion: () => void;
  readonly openHistory: HistorySelection | null;
  readonly onSelectHistory: (selection: HistorySelection) => void;
}) {
  const [regionChooserOpen, setRegionChooserOpen] = useState(false);
  const [regionSearch, setRegionSearch] = useState("");
  const visibleRegions = regions.filter((region) =>
    region.name.toLowerCase().includes(regionSearch.trim().toLowerCase()),
  );
  if (view.rows.length === 0) {
    return (
      <div className="results">
        <p className="warning">Nothing could be priced from that input.</p>
        {view.rejected.length > 0 && <Rejected view={view} />}
        {view.unresolved.length > 0 && <Unresolved view={view} />}
      </div>
    );
  }

  const sellerTotals = view.totals.map((total) => total.sell);
  const buyerTotals = view.totals.map((total) => total.buy);

  return (
    <div className="results">
      <p className="scope-note">{scopeNote(view)}</p>

      {regionChooserOpen && (
        <div id="custom-region-picker" className="region-picker">
          <label htmlFor="region-search">Search market regions</label>
          <input
            id="region-search"
            type="search"
            value={regionSearch}
            onChange={(event) => setRegionSearch(event.target.value)}
            placeholder="Search by region name"
          />
          <label htmlFor="region-select">Custom column region</label>
          <select
            id="region-select"
            aria-label={`Custom column region, currently ${view.customRegion.name}`}
            size={Math.min(8, Math.max(2, visibleRegions.length))}
            disabled={visibleRegions.length === 0}
            value={
              visibleRegions.some((region) => region.id === view.customRegion.id)
                ? String(view.customRegion.id)
                : ""
            }
            onChange={(event) => {
              const region = regions.find(
                (entry) => entry.id === Number(event.target.value),
              );
              if (region !== undefined) {
                onSelectRegion(region);
                setRegionChooserOpen(false);
              }
            }}
          >
            {visibleRegions.map((region) => (
              <option key={region.id} value={region.id}>
                {region.name}
              </option>
            ))}
          </select>
          {visibleRegions.length === 0 && (
            <p className="region-empty">No regions match that search.</p>
          )}
          <button type="button" className="region-reset" onClick={onResetRegion}>
            Reset to Rens (Heimatar)
          </button>
        </div>
      )}

      <div className="table-wrap">
        <table className="prices">
          <thead>
            <tr>
              <th rowSpan={2} scope="col">
                item
              </th>
              <th rowSpan={2} scope="col" className="num">
                qty
              </th>
              <th rowSpan={2} scope="col">
                side
              </th>
              {view.hubs.map((hub) => (
                <th key={hub.key} scope="col" title={hub.scope}>
                  {hub.key === "custom" ? (
                    <button
                      type="button"
                      className="region-column-trigger"
                      aria-expanded={regionChooserOpen}
                      aria-controls={
                        regionChooserOpen ? "custom-region-picker" : undefined
                      }
                      onClick={() => setRegionChooserOpen((open) => !open)}
                    >
                      {hub.label}{" "}
                      <span className="region-scope-label">region</span>
                      <span aria-hidden="true">v</span>
                    </button>
                  ) : (
                    hub.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => {
              const sellerPrices = row.cells.map((cell) => cell.sell);
              const buyerPrices = row.cells.map((cell) => cell.buy);
              return (
                <Fragment key={row.name}>
                  <tr className="seller-row">
                    <th rowSpan={2} scope="row">
                      <span className="item-identity">
                        <img
                          className="item-icon"
                          src={`https://images.evetech.net/types/${row.typeId}/icon?size=64`}
                          alt=""
                          aria-hidden="true"
                          width={32}
                          height={32}
                          loading="lazy"
                        />
                        {row.name}
                      </span>
                    </th>
                    <td rowSpan={2} className="num">
                      {row.quantity.toLocaleString("en-US")}
                    </td>
                    <th scope="row" className="side-label">Sellers</th>
                    {row.cells.map((cell, index) => {
                      const hub = view.hubs[index];
                      return hub === undefined ? null : (
                        <PriceCell
                          key={hub.key}
                          item={row}
                          hubKey={hub.key}
                          customRegionId={
                            hub.key === "custom" ? view.customRegion.id : undefined
                          }
                          hubLabel={hub.label}
                          side="sell"
                          value={cell.sell}
                          prices={sellerPrices}
                          openHistory={openHistory}
                          onSelectHistory={onSelectHistory}
                        />
                      );
                    })}
                  </tr>
                  <tr className="buyer-row">
                    <th scope="row" className="side-label">Buyers</th>
                    {row.cells.map((cell, index) => {
                      const hub = view.hubs[index];
                      return hub === undefined ? null : (
                        <PriceCell
                          key={hub.key}
                          item={row}
                          hubKey={hub.key}
                          customRegionId={
                            hub.key === "custom" ? view.customRegion.id : undefined
                          }
                          hubLabel={hub.label}
                          side="buy"
                          value={cell.buy}
                          prices={buyerPrices}
                          openHistory={openHistory}
                          onSelectHistory={onSelectHistory}
                        />
                      );
                    })}
                  </tr>
                  {openHistory?.typeId === row.typeId && (
                    <tr className="history-table-row">
                      <td colSpan={3 + view.hubs.length}>
                        <HistoryPanel
                          key={`${row.typeId}-${openHistory.hubKey}-${openHistory.customRegionId ?? ""}`}
                          panelId={`history-${row.typeId}-${openHistory.hubKey}-${openHistory.customRegionId ?? ""}`}
                          typeId={row.typeId}
                          itemName={row.name}
                          hubKey={openHistory.hubKey}
                          customRegionId={openHistory.customRegionId}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="seller-row">
              <th rowSpan={2} scope="row">total</th>
              <td rowSpan={2} />
              <th scope="row" className="side-label">Sellers</th>
              {view.totals.map((total, index) => (
                <td
                  key={view.hubs[index]?.key ?? index}
                  className={`num strong hub-start ${priceRankClass(total.sell, sellerTotals)}`}
                >
                  {isk(total.sell)}
                </td>
              ))}
            </tr>
            <tr className="buyer-row">
              <th scope="row" className="side-label">Buyers</th>
              {view.totals.map((total, index) => (
                <td
                  key={view.hubs[index]?.key ?? index}
                  className={`num strong hub-start ${priceRankClass(total.buy, buyerTotals)}`}
                >
                  {isk(total.buy)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="legend">
        <strong>Buyers</strong> = best buy order, what you receive by selling
        into it. <strong>Sellers</strong> = best sell order, what you pay by
        buying from them. Red is more expensive and green is cheaper across
        hubs for that row. A dash means no orders on that side in that scope.
      </p>

      {view.unresolved.length > 0 && <Unresolved view={view} />}
      {view.rejected.length > 0 && <Rejected view={view} />}
    </div>
  );
}

function PriceCell({
  item,
  hubKey,
  customRegionId,
  hubLabel,
  side,
  value,
  prices,
  openHistory,
  onSelectHistory,
}: {
  readonly item: AppraiseView["rows"][number];
  readonly hubKey: HubKey | "custom";
  readonly customRegionId?: number;
  readonly hubLabel: string;
  readonly side: "buy" | "sell";
  readonly value: number | null;
  readonly prices: readonly (number | null)[];
  readonly openHistory: HistorySelection | null;
  readonly onSelectHistory: (selection: HistorySelection) => void;
}) {
  const expanded =
    openHistory?.typeId === item.typeId &&
    openHistory.hubKey === hubKey &&
    (hubKey !== "custom" ||
      openHistory.customRegionId === customRegionId);
  const panelId = `history-${item.typeId}-${hubKey}-${customRegionId ?? ""}`;
  const sideName = side === "sell" ? "Sellers" : "Buyers";

  return (
    <td
      className={`num hub-start ${priceRankClass(value, prices)}${expanded ? " history-active" : ""}`}
    >
      <button
        type="button"
        className="price-cell-trigger"
        aria-label={`${expanded ? "Close" : "Open"} ${item.name} market history for ${hubLabel}, ${sideName}`}
        aria-expanded={expanded}
        aria-controls={expanded ? panelId : undefined}
        onClick={() =>
          onSelectHistory({
            typeId: item.typeId,
            itemName: item.name,
            hubKey,
            customRegionId,
          })
        }
      >
        {isk(value)}
      </button>
    </td>
  );
}

function Unresolved({ view }: { view: AppraiseView }) {
  return (
    <p className="warning">
      Not found as an inventory type:{" "}
      {view.unresolved.map((entry) => `${entry.name} x${entry.quantity}`).join(", ")}
    </p>
  );
}

function Rejected({ view }: { view: AppraiseView }) {
  return (
    <ul className="warning-list">
      {view.rejected.map((entry) => (
        <li key={`${entry.line}-${entry.raw}`}>
          line {entry.line}: {entry.reason} ({entry.raw})
        </li>
      ))}
    </ul>
  );
}

export function AppraiseForm() {
  // Controlled on purpose: an uncontrolled textarea lost its value when the
  // result re-rendered, so "toggle scope" silently submitted an empty box
  // (observed in a real browser on 2026-11-19).
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("region");
  const [hydrated, setHydrated] = useState(false);
  const [regionsHydrated, setRegionsHydrated] = useState(false);
  const [regions, setRegions] = useState<readonly MarketRegion[]>([]);
  const [customRegion, setCustomRegion] =
    useState<MarketRegion>(DEFAULT_CUSTOM_REGION);
  const [regionError, setRegionError] = useState<string | null>(null);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [openHistory, setOpenHistory] = useState<HistorySelection | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const submitAfterModeChange = useRef(false);
  const submitAfterRegionChange = useRef(false);
  const submitAfterRestore = useRef(false);
  const invalidShareLink = useRef(false);

  useEffect(() => {
    let active = true;
    void marketRegionsAction()
      .then((result) => {
        if (!active) return;
        if (result.status === "error") {
          setRegionError(result.message);
          setRegions([DEFAULT_CUSTOM_REGION]);
          return;
        }

        setRegions(result.regions);
        let selected = DEFAULT_CUSTOM_REGION;
        try {
          const savedRegionId = Number(
            window.localStorage.getItem(CUSTOM_REGION_KEY),
          );
          selected =
            result.regions.find((region) => region.id === savedRegionId) ??
            DEFAULT_CUSTOM_REGION;
        } catch {
          setStorageUnavailable(true);
        }
        setCustomRegion(selected);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setRegionError(
          error instanceof Error
            ? `Region list failed: ${error.message}`
            : "Region list failed for an unknown reason.",
        );
        setRegions([DEFAULT_CUSTOM_REGION]);
      })
      .finally(() => {
        if (active) setRegionsHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const fragment = window.location.hash;
    if (fragment !== "") {
      void decodeSharedAppraisal(fragment)
        .then((shared) => {
          if (!active) return;
          invalidShareLink.current = false;
          setText(shared.text);
          setMode(shared.mode);
          submitAfterRestore.current = true;
        })
        .catch((error: unknown) => {
          if (!active) return;
          invalidShareLink.current = true;
          setShareError(
            error instanceof Error
              ? `Invalid share link: ${error.message}`
              : "Invalid share link. Check the URL and try again.",
          );
        })
        .finally(() => {
          if (active) setHydrated(true);
        });
      return () => {
        active = false;
      };
    }

    try {
      const savedText = window.localStorage.getItem(LAST_APPRAISAL_KEY);
      if (savedText?.trim()) {
        setText(savedText);
        submitAfterRestore.current = true;
      }
    } catch {
      setStorageUnavailable(true);
    } finally {
      setHydrated(true);
    }

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !regionsHydrated || !submitAfterRestore.current) return;
    submitAfterRestore.current = false;
    formRef.current?.requestSubmit();
  }, [hydrated, regionsHydrated, text, mode]);

  // The mode is injected into FormData from React state instead of living in a
  // form field: React resets form fields when a server action completes, and a
  // radio's checked state is exactly what that reset breaks.
  const [state, formAction, pending] = useActionState(
    async (previous: AppraiseState, formData: FormData) => {
      const submittedText = String(formData.get("text") ?? "");
      if (
        invalidShareLink.current &&
        submittedText.trim() === ""
      ) {
        return {
          ...previous,
          status: "error" as const,
          message: "Enter an inventory before appraising this invalid link.",
        };
      }
      const appraisalText =
        submittedText.trim() === "" ? SAMPLE_TEXT : submittedText;
      formData.set("text", appraisalText);
      formData.set("mode", mode);
      formData.set("customRegionId", String(customRegion.id));
      setText(appraisalText);
      try {
        window.localStorage.setItem(LAST_APPRAISAL_KEY, appraisalText);
      } catch {
        setStorageUnavailable(true);
      }
      const result = await appraiseAction(previous, formData);
      const parsedItemCount = parseInventory(appraisalText).items.length;
      if (
        appraisalText.length > MAX_SHARED_TEXT_LENGTH ||
        parsedItemCount > MAX_INVENTORY_ITEMS
      ) {
        updateShareFragment("");
        setShareError(
          "Appraisal ran, but this inventory exceeds the share-link limits.",
        );
        return result;
      }

      try {
        const fragment = await encodeSharedAppraisal(appraisalText, mode);
        updateShareFragment(fragment);
        invalidShareLink.current = false;
        setShareError(null);
      } catch (error) {
        updateShareFragment("");
        setShareError(
          error instanceof Error
            ? `Appraisal ran, but a share link could not be created: ${error.message}`
            : "Appraisal ran, but a share link could not be created.",
        );
      }
      return result;
    },
    initialState,
  );

  useEffect(() => {
    if (state.view !== undefined) setOpenHistory(null);
  }, [state.view]);

  // Re-price after a scope change, using the action bound to the new mode.
  useEffect(() => {
    if (!submitAfterModeChange.current) return;
    submitAfterModeChange.current = false;
    formRef.current?.requestSubmit();
  }, [mode]);

  function chooseMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    // Flipping scope on an empty form should not trigger an error.
    if (text.trim() !== "") submitAfterModeChange.current = true;
  }

  useEffect(() => {
    if (!submitAfterRegionChange.current) return;
    submitAfterRegionChange.current = false;
    formRef.current?.requestSubmit();
  }, [customRegion]);

  function chooseRegion(region: MarketRegion) {
    if (region.id === customRegion.id) return;
    setCustomRegion(region);
    setOpenHistory(null);
    try {
      window.localStorage.setItem(CUSTOM_REGION_KEY, String(region.id));
    } catch {
      setStorageUnavailable(true);
    }
    if (text.trim() !== "") submitAfterRegionChange.current = true;
  }

  function resetRegion() {
    chooseRegion(DEFAULT_CUSTOM_REGION);
  }

  function updateShareFragment(fragment: string) {
    if (window.location.hash === fragment) return;
    const nextUrl = `${window.location.pathname}${window.location.search}${fragment}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  }

  return (
    <section className="appraise">
      <form ref={formRef} action={formAction}>
        <input type="hidden" name="customRegionId" value={customRegion.id} />
        {storageUnavailable && (
          <p className="warning">
            Browser storage is unavailable; app preferences cannot be remembered.
          </p>
        )}
        <label className="field-label" htmlFor="text">
          Inventory or item names
        </label>
        <textarea
          id="text"
          name="text"
          rows={8}
          spellCheck={false}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key !== "Enter" ||
              (!event.metaKey && !event.ctrlKey) ||
              !regionsHydrated
            ) {
              return;
            }
            event.preventDefault();
            if (!pending) formRef.current?.requestSubmit();
          }}
          placeholder={SAMPLE_TEXT}
        />

        <div className="controls">
          <div className="scope" role="group" aria-label="Price scope">
            <span className="scope-label">Price scope</span>
            <button
              type="button"
              className={mode === "region" ? "seg on" : "seg"}
              aria-pressed={mode === "region"}
              onClick={() => chooseMode("region")}
            >
              Region
            </button>
            <button
              type="button"
              className={mode === "system" ? "seg on" : "seg"}
              aria-pressed={mode === "system"}
              onClick={() => chooseMode("system")}
            >
              System
            </button>
            <button
              type="button"
              className={mode === "station" ? "seg on" : "seg"}
              aria-pressed={mode === "station"}
              onClick={() => chooseMode("station")}
            >
              Station
            </button>
          </div>

          <button
            type="submit"
            className="appraise-button"
            disabled={pending || !regionsHydrated}
          >
            {pending ? "Pricing..." : "Appraise"}
          </button>
        </div>
      </form>

      {regionError !== null && <p className="error" role="alert">{regionError}</p>}
      {state.status === "error" && <p className="error">{state.message}</p>}
      {shareError !== null && (
        <p className="error" role="alert">{shareError}</p>
      )}
      {state.view !== undefined && (
        <Results
          view={state.view}
          regions={regions}
          onSelectRegion={chooseRegion}
          onResetRegion={resetRegion}
          openHistory={openHistory}
          onSelectHistory={(selection) => {
            setOpenHistory((current) =>
              current?.typeId === selection.typeId &&
              current.hubKey === selection.hubKey
                ? null
                : selection,
            );
          }}
        />
      )}
    </section>
  );
}
