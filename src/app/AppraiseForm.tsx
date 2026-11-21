"use client";

import { Fragment, useActionState, useEffect, useRef, useState } from "react";
import {
  appraiseAction,
  type AppraiseState,
  type AppraiseView,
} from "./actions";
import { priceRank } from "./price-rank";

const initialState: AppraiseState = { status: "idle", mode: "region" };
const SAMPLE_TEXT = "Tritanium 1000000\nHobgoblin I 10\nIshtar 1";
const LAST_APPRAISAL_KEY = "apolloeve-last-appraisal";

type Mode = "region" | "station" | "system";

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
  if (view.mode === "region") {
    return "Every order in each hub's region.";
  }
  if (view.mode === "station") {
    const jita = view.hubs[0]?.scope ?? "";
    return `Per hub station, for example ${jita}.`;
  }
  return "Every order in each hub's solar system, including structures.";
}

function Results({ view }: { view: AppraiseView }) {
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
                  {hub.label}
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
                    {row.cells.map((cell, index) => (
                      <td
                        key={view.hubs[index]?.key ?? index}
                        className={`num hub-start ${priceRankClass(cell.sell, sellerPrices)}`}
                      >
                        {isk(cell.sell)}
                      </td>
                    ))}
                  </tr>
                  <tr className="buyer-row">
                    <th scope="row" className="side-label">Buyers</th>
                    {row.cells.map((cell, index) => (
                      <td
                        key={view.hubs[index]?.key ?? index}
                        className={`num hub-start ${priceRankClass(cell.buy, buyerPrices)}`}
                      >
                        {isk(cell.buy)}
                      </td>
                    ))}
                  </tr>
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
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const submitAfterModeChange = useRef(false);
  const submitAfterRestore = useRef(false);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (!hydrated || !submitAfterRestore.current) return;
    submitAfterRestore.current = false;
    formRef.current?.requestSubmit();
  }, [hydrated, text]);

  // The mode is injected into FormData from React state instead of living in a
  // form field: React resets form fields when a server action completes, and a
  // radio's checked state is exactly what that reset breaks.
  const [state, formAction, pending] = useActionState(
    async (previous: AppraiseState, formData: FormData) => {
      const submittedText = String(formData.get("text") ?? "");
      const appraisalText =
        submittedText.trim() === "" ? SAMPLE_TEXT : submittedText;
      formData.set("text", appraisalText);
      formData.set("mode", mode);
      setText(appraisalText);
      try {
        window.localStorage.setItem(LAST_APPRAISAL_KEY, appraisalText);
        setStorageUnavailable(false);
      } catch {
        setStorageUnavailable(true);
      }
      return appraiseAction(previous, formData);
    },
    initialState,
  );

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

  return (
    <section className="appraise">
      <form ref={formRef} action={formAction}>
        {storageUnavailable && (
          <p className="warning">
            Browser storage is unavailable; the last appraisal cannot be remembered.
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
            if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) return;
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
              className={mode === "station" ? "seg on" : "seg"}
              aria-pressed={mode === "station"}
              onClick={() => chooseMode("station")}
            >
              Hub station
            </button>
            <button
              type="button"
              className={mode === "system" ? "seg on" : "seg"}
              aria-pressed={mode === "system"}
              onClick={() => chooseMode("system")}
            >
              Whole system
            </button>
          </div>

          <button type="submit" className="appraise-button" disabled={pending}>
            {pending ? "Pricing..." : "Appraise"}
          </button>
        </div>
      </form>

      {state.status === "error" && <p className="error">{state.message}</p>}
      {state.view !== undefined && <Results view={state.view} />}
    </section>
  );
}
