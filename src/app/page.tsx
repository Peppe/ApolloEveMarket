import { AppraiseForm } from "./AppraiseForm";

export default function Home() {
  return (
    <main className="page">
      <h1>ApolloEveMarket</h1>
      <p className="lede">
        Paste an inventory or type item names. Get buy and sell prices for Jita,
        Dodixie, Amarr, Hek and Rens at once.
      </p>

      <AppraiseForm />

      <p className="footnote">
        Prices come from live EVE ESI market orders, cached exactly as long as
        CCP says they are current. Nothing is stored about you.
      </p>
    </main>
  );
}
