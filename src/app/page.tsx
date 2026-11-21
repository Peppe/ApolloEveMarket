import { AppraiseForm } from "./AppraiseForm";

/**
 * A cold appraisal of a large paste can spend tens of seconds walking ESI
 * pages; the platform default would cut the server action off mid-way.
 */
export const maxDuration = 60;

export default function Home() {
  return (
    <main className="page">
      <h1 className="brand-title">ApolloEveMarket</h1>
      <p className="lede">
        Paste an inventory or type item names. Get buy and sell prices for Jita,
        Dodixie, Amarr and Hek, with a searchable custom market region.
      </p>

      <AppraiseForm />

      <p className="footnote">
        Prices come from live EVE ESI market orders, cached exactly as long as
        CCP says they are current. Your last input and custom region preference
        are saved only in this browser; appraisals are not stored on the server.
      </p>
    </main>
  );
}
