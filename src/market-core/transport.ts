/**
 * HTTP seam for every ESI call.
 *
 * Everything above this file works against `Transport`, so tests, the smoke
 * command and the web layer share one code path and only the transport differs.
 */

export interface HttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export interface TransportRequest {
  readonly method?: "GET" | "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

export type Transport = (
  url: string,
  request: TransportRequest,
) => Promise<HttpResponse>;

/** ESI requires a descriptive User-Agent and asks for a datasource argument. */
export const ESI_BASE_URL = "https://esi.evetech.net/latest";
export const ESI_USER_AGENT = "ApolloEveMarket/0.1 (+https://github.com/Peppe/ApolloEveMarket)";

/**
 * The schema version ESI advertised when the fixtures were captured
 * (`x-compatibility-date: 2020-01-01`). Pinning it means CCP cannot change a
 * payload shape underneath us without us noticing.
 */
export const ESI_COMPATIBILITY_DATE = "2020-01-01";

export function createFetchTransport(
  fetchImpl: typeof fetch = fetch,
): Transport {
  return async (url, request) => {
    const response = await fetchImpl(url, {
      method: request.method ?? "GET",
      headers: request.headers,
      body: request.body,
      // We do our own HTTP caching (Expires + ETag); keep the platform's
      // fetch cache out of it.
      cache: "no-store",
    });

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    return {
      status: response.status,
      headers,
      body: await response.text(),
    };
  };
}
