/**
 * Pasted inventory -> item names and quantities.
 *
 * The grammar is deliberately narrow: tab-separated (EVE's inventory copy) and
 * space-separated with a trailing integer. For inventory rows, only the item
 * name and quantity columns are used; trailing metadata is ignored.
 */

export interface ParsedItem {
  readonly name: string;
  readonly quantity: number;
}

export interface RejectedLine {
  readonly line: number;
  readonly raw: string;
  readonly reason: string;
}

export type ParsedInventoryEntry =
  | { readonly type: "header"; readonly title: string }
  | { readonly type: "item"; readonly itemIndex: number };

export interface ParseResult {
  readonly items: readonly ParsedItem[];
  readonly entries: readonly ParsedInventoryEntry[];
  readonly rejected: readonly RejectedLine[];
}

const PLAIN_INT = /^\d+$/;
const GROUPED_INT = /^\d{1,3}(?:,\d{3})+$/;
const NUMERIC_LOOKING = /^[+-]?[\d.,]+$/;

function parseQuantity(token: string): { ok: true; value: number } | { ok: false; reason: string } {
  if (GROUPED_INT.test(token)) {
    return { ok: true, value: Number(token.replace(/,/g, "")) };
  }
  if (PLAIN_INT.test(token)) {
    const value = Number(token);
    if (value === 0) return { ok: false, reason: "quantity must be greater than zero" };
    return { ok: true, value };
  }
  if (token.includes(".")) {
    return {
      ok: false,
      reason: "ambiguous decimal quantity (write 1000 or 1,000)",
    };
  }
  if (token.includes(",")) {
    return { ok: false, reason: "invalid thousands grouping" };
  }
  return { ok: false, reason: "quantity must be a positive whole number" };
}

export function parseInventory(text: string): ParseResult {
  const items = new Map<string, ParsedItem>();
  const entries: ParsedInventoryEntry[] = [];
  const rejected: RejectedLine[] = [];

  const lines = text.split(/\r?\n/);

  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (line === "") return;

    const unindented = raw.trimStart();
    if (unindented.startsWith("# ")) {
      const title = unindented.slice(2).trim();
      if (title === "") {
        rejected.push({
          line: index + 1,
          raw,
          reason: "section heading must include a title",
        });
        return;
      }
      entries.push({ type: "header", title });
      return;
    }

    let name: string;
    let quantityToken: string | null = null;

    const tab = line.indexOf("\t");
    if (tab >= 0) {
      const columns = line.split("\t");
      name = (columns[0] ?? "").trim();
      const quantityColumn = (columns[1] ?? "").trim();
      quantityToken = quantityColumn === "" ? null : quantityColumn;
      if (name === "") {
        rejected.push({ line: index + 1, raw, reason: "missing item name" });
        return;
      }
    } else {
      const tokens = line.split(/\s+/);
      const last = tokens[tokens.length - 1] ?? "";
      if (tokens.length > 1 && NUMERIC_LOOKING.test(last)) {
        name = tokens.slice(0, -1).join(" ").trim();
        quantityToken = last;
      } else if (tokens.length === 1 && NUMERIC_LOOKING.test(last)) {
        rejected.push({ line: index + 1, raw, reason: "missing item name" });
        return;
      } else {
        name = line;
      }
    }

    let quantity = 1;
    if (quantityToken !== null) {
      const parsed = parseQuantity(quantityToken);
      if (!parsed.ok) {
        rejected.push({ line: index + 1, raw, reason: parsed.reason });
        return;
      }
      quantity = parsed.value;
    }

    const key = name.toLowerCase();
    const existing = items.get(key);
    if (existing !== undefined) {
      items.set(key, { name: existing.name, quantity: existing.quantity + quantity });
    } else {
      items.set(key, { name, quantity });
      entries.push({ type: "item", itemIndex: items.size - 1 });
    }
  });

  return { items: [...items.values()], entries, rejected };
}
