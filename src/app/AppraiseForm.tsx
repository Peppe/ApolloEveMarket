"use client";

import { Fragment, useActionState, useEffect, useRef, useState } from "react";
import {
  appraiseAction,
  type AppraiseState,
  type AppraiseView,
} from "./actions";

const initialState: AppraiseState = { status: "idle", mode: "station" };

type Mode = "station" | "system";

function isk(value: number | null): string {
  if (value === null) return "-";
  if (value < 1000) return value.toFixed(2);
  return Math.round(value).toLocaleString("en-US");
}

function scopeNote(view: AppraiseView): string {
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
              {view.hubs.map((hub) => (
                <th key={hub.key} colSpan={2} scope="colgroup" title={hub.scope}>
                  {hub.label}
                </th>
              ))}
            </tr>
            <tr>
              {view.hubs.map((hub) => (
                <Fragment key={hub.key}>
                  <th scope="col" className="num sub">
                    buy
                  </th>
                  <th scope="col" className="num sub">
                    sell
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <tr key={row.name}>
                <th scope="row">{row.name}</th>
                <td className="num">{row.quantity.toLocaleString("en-US")}</td>
                {row.cells.map((cell, index) => (
                  <Fragment key={view.hubs[index]?.key ?? index}>
                    <td className={`num hub-start${cell.buy === null ? " muted" : ""}`}>
                      {isk(cell.buy)}
                    </td>
                    <td className={cell.sell === null ? "num muted" : "num"}>
                      {isk(cell.sell)}
                    </td>
                  </Fragment>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">total</th>
              <td />
              {view.totals.map((total, index) => (
                <Fragment key={view.hubs[index]?.key ?? index}>
                  <td className="num strong hub-start">{isk(total.buy)}</td>
                  <td className="num strong">{isk(total.sell)}</td>
                </Fragment>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="legend">
        <strong>buy</strong> = best buy order, what you receive by selling into
        it. <strong>sell</strong> = best sell order, what you pay by buying from
        it. A dash means no orders on that side in that scope.
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
  const [mode, setMode] = useState<Mode>("station");
  const formRef = useRef<HTMLFormElement>(null);
  const submitAfterModeChange = useRef(false);

  // The mode is injected into FormData from React state instead of living in a
  // form field: React resets form fields when a server action completes, and a
  // radio's checked state is exactly what that reset breaks.
  const [state, formAction, pending] = useActionState(
    async (previous: AppraiseState, formData: FormData) => {
      formData.set("mode", mode);
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
          placeholder={"Tritanium 1000000\nHobgoblin I 10\nIshtar 1"}
        />

        <div className="controls">
          <div className="scope" role="group" aria-label="Price scope">
            <span className="scope-label">Price scope</span>
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
