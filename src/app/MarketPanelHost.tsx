import type { ReactNode } from "react";

interface MarketPanelHostProps {
  readonly panelId: string;
  readonly title: string;
  readonly scope?: string;
  readonly children: ReactNode;
}

export function MarketPanelHost({
  panelId,
  title,
  scope,
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
          <button type="button" aria-pressed="true">
            History
          </button>
          <button
            type="button"
            aria-pressed="false"
            disabled
            title="Order book panel is not implemented yet"
          >
            Order book
          </button>
        </div>
      </header>
      {children}
    </section>
  );
}
