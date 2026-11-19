export default function Home() {
  return (
    <main className="page">
      <h1>ApolloEveMarket</h1>
      <p className="lede">
        Paste an inventory, get buy and sell prices for Jita, Dodixie, Amarr,
        Hek and Rens.
      </p>
      <p className="status">
        Phase 1: the UI-free market core. There is no paste box yet - the
        verified pricing logic and its fixtures land first.
      </p>
      <p className="hint">
        Try it from a terminal: <code>npm run smoke -- &quot;Tritanium&quot;</code>
      </p>
    </main>
  );
}
