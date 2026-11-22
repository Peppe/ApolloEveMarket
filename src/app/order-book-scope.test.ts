import { describe, expect, it } from "vitest";
import { HUBS } from "../market-core";
import { orderBookScopeFor } from "./order-book-scope";

describe("order book scope", () => {
  it("uses the selected region, system, or station for fixed hubs", () => {
    const jita = HUBS.find((hub) => hub.key === "jita");
    expect(jita).toBeDefined();
    expect(orderBookScopeFor(34, "jita", "region")).toEqual({
      regionId: jita?.regionId,
      label: "Jita region",
    });
    expect(orderBookScopeFor(34, "jita", "system")).toEqual({
      regionId: jita?.regionId,
      label: "Jita solar system",
      systemId: jita?.systemId,
    });
    expect(orderBookScopeFor(34, "jita", "station")).toEqual({
      regionId: jita?.regionId,
      label: jita?.stationName,
      systemId: jita?.systemId,
      stationId: jita?.stationId,
    });
  });

  it("uses the selected custom region at regional scope", () => {
    expect(
      orderBookScopeFor(34, "custom", "station", {
        id: 10000041,
        name: "Syndicate",
      }),
    ).toEqual({ regionId: 10000041, label: "Syndicate region" });
    expect(orderBookScopeFor(34, "custom", "region")).toBeNull();
  });

  it("uses the global market region for PLEX and rejects invalid input", () => {
    expect(orderBookScopeFor(44992, "jita", "station")).toEqual({
      regionId: 19000001,
      label: "Global market (PLEX)",
    });
    expect(orderBookScopeFor(0, "jita", "region")).toBeNull();
    expect(orderBookScopeFor(34, "unknown", "region")).toBeNull();
  });
});
