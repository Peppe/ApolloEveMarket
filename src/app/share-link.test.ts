import { describe, expect, it } from "vitest";
import {
  decodeSharedAppraisal,
  encodeSharedAppraisal,
  MAX_SHARED_TEXT_LENGTH,
} from "./share-link";

describe("share link encoding", () => {
  it("round-trips exact inventory text and each selected scope", async () => {
    const text = "Tritanium 1000000\r\nHobgoblin I\t10\r\n";
    for (const mode of ["region", "system", "station"] as const) {
      const fragment = await encodeSharedAppraisal(text, mode);
      expect(await decodeSharedAppraisal(fragment)).toEqual({ text, mode });
      expect(fragment).toMatch(/^#1[rst][A-Za-z0-9_-]+$/);
    }
  });

  it("preserves Unicode input and rejects unpaired UTF-16 surrogates", async () => {
    const text = "\uFEFFTritanium \u{1F680} 1";
    const fragment = await encodeSharedAppraisal(text, "region");
    expect(await decodeSharedAppraisal(fragment)).toEqual({
      text,
      mode: "region",
    });
    await expect(
      encodeSharedAppraisal(`Tritanium \uD800 1`, "region"),
    ).rejects.toThrow("losslessly");
  });

  it("is deterministic and omits Base64 padding", async () => {
    const first = await encodeSharedAppraisal("Tritanium 1000000", "region");
    const second = await encodeSharedAppraisal("Tritanium 1000000", "region");
    expect(second).toBe(first);
    expect(first).not.toContain("=");
    expect(first).not.toMatch(/[+=/]/);
  });

  it("keeps a representative inventory compact and round-trips maximum input", async () => {
    const representative = [
      "Tritanium 1000000",
      "Pyerite 250000",
      "Mexallon 75000",
      "Isogen 50000",
      "Nocxium 12000",
      "Zydrine 2500",
      "Megacyte 1800",
      "PLEX 500",
      "Hobgoblin I 20",
      "Warrior II 10",
      "Hammerhead II 5",
      "Valkyrie II 5",
      "Ishtar 2",
      "Astero 1",
      "Strategic Cruiser 1",
      "Large Shield Extender II 12",
      "Damage Control II 8",
      "Multispectrum Shield Hardener II 6",
      "5MN Microwarpdrive II 4",
      "Nanofiber Internal Structure II 10",
    ].join("\n");
    const representativeFragment = await encodeSharedAppraisal(
      representative,
      "region",
    );
    expect(representativeFragment.length).toBeLessThan(representative.length + 3);

    let seed = 123456789;
    let maximumText = "";
    for (let index = 0; index < MAX_SHARED_TEXT_LENGTH; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      maximumText += String.fromCharCode(32 + (seed % 95));
    }
    const maximumFragment = await encodeSharedAppraisal(maximumText, "station");
    expect(maximumFragment.length).toBeLessThan(27_000);
    expect(await decodeSharedAppraisal(maximumFragment)).toEqual({
      text: maximumText,
      mode: "station",
    });
  });

  it("rejects malformed, unsupported, oversized, and over-item-limit links", async () => {
    await expect(decodeSharedAppraisal("#2rabc")).rejects.toThrow(
      "unsupported format",
    );
    await expect(decodeSharedAppraisal("#1xabc")).rejects.toThrow(
      "invalid price scope",
    );
    await expect(decodeSharedAppraisal("#1r%%%")).rejects.toThrow(
      "malformed",
    );
    await expect(decodeSharedAppraisal("#1rAAAA")).rejects.toThrow();
    await expect(
      encodeSharedAppraisal("x".repeat(MAX_SHARED_TEXT_LENGTH + 1), "region"),
    ).rejects.toThrow("size limit");

    const tooManyItems = Array.from(
      { length: 101 },
      (_, index) => `Test Item ${index + 1}\t1`,
    ).join("\n");
    await expect(
      decodeSharedAppraisal(await encodeSharedAppraisal(tooManyItems, "region")),
    ).rejects.toThrow("100-item limit");
  });
});
