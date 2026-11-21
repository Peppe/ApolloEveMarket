import { describe, expect, it } from "vitest";
import { HUBS } from "../market-core";
import { historyScopeFor } from "./history-scope";

describe("history scope", () => {
  it("uses the selected hub's region for regular items", () => {
    for (const hub of HUBS) {
      expect(historyScopeFor(34, hub.key)).toEqual({
        regionId: hub.regionId,
        label: `${hub.label} region`,
      });
    }
  });

  it("uses the global market region for PLEX", () => {
    expect(historyScopeFor(44992, "jita")).toEqual({
      regionId: 19000001,
      label: "Global market (PLEX)",
    });
    expect(historyScopeFor(44992, "custom", { id: 10000041, name: "Syndicate" })).toEqual({
      regionId: 19000001,
      label: "Global market (PLEX)",
    });
  });

  it("uses the chosen custom region for regular-item history", () => {
    expect(
      historyScopeFor(34, "custom", { id: 10000041, name: "Syndicate" }),
    ).toEqual({ regionId: 10000041, label: "Syndicate region" });
    expect(historyScopeFor(34, "custom")).toBeNull();
  });

  it("rejects invalid item and hub input", () => {
    expect(historyScopeFor(0, "jita")).toBeNull();
    expect(historyScopeFor(34, "unknown")).toBeNull();
  });
});
