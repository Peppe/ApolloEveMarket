import { parseInventory } from "../market-core";
import {
  MAX_INVENTORY_ITEMS,
  MAX_INVENTORY_LENGTH,
  type PriceMode,
} from "../market-core";

export const MAX_SHARED_TEXT_LENGTH = MAX_INVENTORY_LENGTH;
const MAX_DECOMPRESSED_BYTES = MAX_SHARED_TEXT_LENGTH * 3;
const MAX_ENCODED_PAYLOAD_LENGTH = 81_000;
const SHARE_SCOPE_CODES: Readonly<Record<PriceMode, string>> = {
  region: "r",
  system: "s",
  station: "t",
};
const CODE_SHARE_SCOPES: Readonly<Record<string, PriceMode>> = {
  r: "region",
  s: "system",
  t: "station",
};

export interface SharedAppraisal {
  readonly text: string;
  readonly mode: PriceMode;
}

export class ShareLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShareLinkError";
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(payload: string): Uint8Array {
  if (
    payload.length > MAX_ENCODED_PAYLOAD_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(payload)
  ) {
    throw new ShareLinkError("The share link payload is malformed.");
  }
  const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new ShareLinkError("The share link payload is malformed.");
  }
}

async function transform(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  const writableBytes = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  writableBytes.set(bytes);
  const reader = stream.readable.getReader();
  const readPromise = (async () => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_DECOMPRESSED_BYTES) {
        await reader.cancel();
        throw new ShareLinkError("The decoded inventory exceeds the size limit.");
      }
      chunks.push(value);
    }

    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  })();

  try {
    await writer.write(writableBytes);
    await writer.close();
    return await readPromise;
  } catch (error) {
    await writer.abort(error).catch(() => undefined);
    await reader.cancel(error).catch(() => undefined);
    await readPromise.catch(() => undefined);
    if (error instanceof ShareLinkError) throw error;
    throw new ShareLinkError("The share link compression data is invalid.");
  }
}

export async function encodeSharedAppraisal(
  text: string,
  mode: PriceMode,
): Promise<string> {
  if (text.length > MAX_SHARED_TEXT_LENGTH) {
    throw new ShareLinkError("The inventory exceeds the share link size limit.");
  }
  try {
    const input = new TextEncoder().encode(text);
    if (
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(input) !==
      text
    ) {
      throw new ShareLinkError(
        "The inventory contains text that cannot be encoded losslessly.",
      );
    }
    const compressed = await transform(input, new CompressionStream("deflate"));
    return `#1${SHARE_SCOPE_CODES[mode]}${base64UrlEncode(compressed)}`;
  } catch (error) {
    if (error instanceof ShareLinkError) throw error;
    throw new ShareLinkError("This browser could not create a share link.");
  }
}

export async function decodeSharedAppraisal(
  fragment: string,
): Promise<SharedAppraisal> {
  if (!fragment.startsWith("#1") || fragment.length < 4) {
    throw new ShareLinkError("This share link has an unsupported format.");
  }
  const mode = CODE_SHARE_SCOPES[fragment[2] ?? ""];
  if (mode === undefined) {
    throw new ShareLinkError("This share link has an invalid price scope.");
  }

  let bytes: Uint8Array;
  try {
    bytes = await transform(
      base64UrlDecode(fragment.slice(3)),
      new DecompressionStream("deflate"),
    );
  } catch (error) {
    if (error instanceof ShareLinkError) throw error;
    throw new ShareLinkError("The share link inventory could not be decoded.");
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new ShareLinkError("The share link inventory is not valid UTF-8.");
  }
  if (text.trim() === "") {
    throw new ShareLinkError("The share link does not contain an inventory.");
  }
  if (text.length > MAX_SHARED_TEXT_LENGTH) {
    throw new ShareLinkError("The decoded inventory exceeds the size limit.");
  }
  if (parseInventory(text).items.length > MAX_INVENTORY_ITEMS) {
    throw new ShareLinkError("The shared inventory exceeds the 100-item limit.");
  }
  return { text, mode };
}
