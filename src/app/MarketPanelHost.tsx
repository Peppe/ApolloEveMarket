import type { ReactNode } from "react";

export type MarketPanelMode = "history" | "order-book";

interface MarketPanelHostProps {
  readonly panelId: string;
  readonly title: string;
  readonly scope?: string;
  readonly mode: MarketPanelMode;
  readonly onModeChange: (mode: MarketPanelMode) => void;
  readonly children: ReactNode;
}

export function MarketPanelHost({
  panelId,
  title,
  scope,
  mode,
  onModeChange,
  children,
}: MarketPanelHostProps) {
  return (
    <section
      className="history-panel"
      id={panelId}
      role="region"
      aria-label={title}
    >
      <header className="history-panel-header">
        <div>
          <h3>{title}</h3>
          {scope !== undefined && <p className="history-scope">{scope}</p>}
        </div>
        <div
          className="history-panel-modes"
          role="group"
          aria-label="Market panel"
        >
          <button
            type="button"
            aria-pressed={mode === "history"}
            onClick={() => onModeChange("history")}
          >
            History
          </button>
          <button
            type="button"
            aria-pressed={mode === "order-book"}
            onClick={() => onModeChange("order-book")}
          >
            Order book
          </button>
        </div>
      </header>
      {children}
    </section>
  );
}
