import { describe, expect, it } from "vitest";
import { parseInventory } from "./parse";

describe("parseInventory", () => {
  it("parses the three accepted line forms", () => {
    const result = parseInventory("Tritanium\nHobgoblin I\t10\nIshtar 2\n");
    expect(result.rejected).toEqual([]);
    expect(result.items).toEqual([
      { name: "Tritanium", quantity: 1 },
      { name: "Hobgoblin I", quantity: 10 },
      { name: "Ishtar", quantity: 2 },
    ]);
  });

  it("sums duplicate names regardless of case and skips blank lines", () => {
    const result = parseInventory("\n\nTritanium\t2\n\ntritanium 3\n\n");
    expect(result.items).toEqual([{ name: "Tritanium", quantity: 5 }]);
  });

  it("accepts thousands separators", () => {
    const result = parseInventory("Tritanium\t1,000,000");
    expect(result.items).toEqual([{ name: "Tritanium", quantity: 1_000_000 }]);
  });

  it("parses EVE inventory clipboard rows and ignores trailing metadata", () => {
    const result = parseInventory(
      [
        "5MN Y-T8 Compact Microwarpdrive\t5\tPropulsion Module\tModule\tMedium\t50 m3\t2,046,949.00 ISK",
        "Compact EM Shield Amplifier\t5\tShield Resistance Amplifier\tModule\tMedium\t25 m3\t839,015.10 ISK",
        "Core Probe Launcher I\t5\tScan Probe Launcher\tModule\tHigh\t25 m3\t92,607.25 ISK",
        "Hobgoblin I\t10\tCombat Drone\tDrone\t\t50 m3\t43,782.30 ISK",
        "Medium Shield Extender I\t5\tShield Extender\tModule\tMedium\t50 m3\t157,037.65 ISK",
        "Small Low Friction Nozzle Joints I\t15\tRig Navigation\tModule\tRigs\t75 m3\t3,200,773.05 ISK",
      ].join("\n"),
    );

    expect(result.rejected).toEqual([]);
    expect(result.items).toEqual([
      { name: "5MN Y-T8 Compact Microwarpdrive", quantity: 5 },
      { name: "Compact EM Shield Amplifier", quantity: 5 },
      { name: "Core Probe Launcher I", quantity: 5 },
      { name: "Hobgoblin I", quantity: 10 },
      { name: "Medium Shield Extender I", quantity: 5 },
      { name: "Small Low Friction Nozzle Joints I", quantity: 15 },
    ]);
  });

  it("rejects ambiguous decimals instead of guessing", () => {
    const result = parseInventory("Tritanium 1.000");
    expect(result.items).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toContain("ambiguous decimal");
  });

  it("rejects zero and negative quantities", () => {
    const zero = parseInventory("Tritanium 0");
    expect(zero.rejected[0]?.reason).toContain("greater than zero");

    const negative = parseInventory("Tritanium -5");
    expect(negative.rejected[0]?.reason).toContain("positive whole number");
  });

  it("rejects a numeric-only line as a missing name", () => {
    const result = parseInventory("1000");
    expect(result.items).toEqual([]);
    expect(result.rejected[0]?.reason).toBe("missing item name");
  });

  it("reports the line number of rejected input", () => {
    const result = parseInventory("Tritanium\t1\nbad 1.5\n");
    expect(result.rejected[0]?.line).toBe(2);
    expect(result.rejected[0]?.raw).toBe("bad 1.5");
  });

  it("treats a trailing integer as a quantity (documented limitation)", () => {
    // Tab-separated input stays unambiguous; phase 4 can use a catalogue to
    // disambiguate names that legitimately end in a number.
    const result = parseInventory("Cap Booster 100");
    expect(result.items).toEqual([{ name: "Cap Booster", quantity: 100 }]);
  });
});
