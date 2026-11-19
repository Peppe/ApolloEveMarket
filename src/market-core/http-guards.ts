/**
 * Transport decorators that keep us inside CCP's budget.
 *
 * Everything ESI tells us about our own spending arrives as response headers,
 * so the only place that can see both the request and the response is a
 * transport wrapper:
 *
 *   fetch -> withBudgetGuard -> withConcurrencyLimit
 *
 * The budget guard touches no price data; it exists so the process stops
 * before CCP does. Header names here are lower case because the transport
 * lower-cases them (see `createFetchTransport`).
 */

import type { Transport } from "./transport";

/** A refusal we generated ourselves, or a 420/429 from ESI. */
export class EsiBudgetError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "EsiBudgetError";
  }
}

export interface EsiBudgetOptions {
  /** Stop starting requests at or below this many remaining errors. */
  readonly minErrorBudget?: number;
  /** Stop starting requests at or below this many remaining requests. */
  readonly minRequestBudget?: number;
  readonly now?: () => number;
}

export interface BudgetSnapshot {
  readonly errorRemain: number | null;
  readonly errorResetSeconds: number | null;
  readonly requestRemain: number | null;
  /** As advertised, for example "12000/15m". */
  readonly requestLimit: string | null;
}

export interface EsiBudget {
  /** Last values seen in response headers; null until one arrives. */
  snapshot(): BudgetSnapshot;
  /** Record a response's headers. */
  observe(headers: Readonly<Record<string, string>>): void;
  /** Throw `EsiBudgetError` if the last seen values are below the floor. */
  check(): void;
}

const DEFAULT_MIN_ERROR_BUDGET = 10;
const DEFAULT_MIN_REQUEST_BUDGET = 100;

function readInt(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function createEsiBudget(options: EsiBudgetOptions = {}): EsiBudget {
  const minErrors = options.minErrorBudget ?? DEFAULT_MIN_ERROR_BUDGET;
  const minRequests = options.minRequestBudget ?? DEFAULT_MIN_REQUEST_BUDGET;

  let snapshot: BudgetSnapshot = {
    errorRemain: null,
    errorResetSeconds: null,
    requestRemain: null,
    requestLimit: null,
  };

  return {
    snapshot() {
      return snapshot;
    },

    observe(headers) {
      const errorRemain = readInt(headers["x-esi-error-limit-remain"]);
      const errorResetSeconds = readInt(headers["x-esi-error-limit-reset"]);
      const requestRemain = readInt(headers["x-ratelimit-remaining"]);
      const requestLimit = headers["x-ratelimit-limit"] ?? null;

      snapshot = {
        errorRemain: errorRemain ?? snapshot.errorRemain,
        errorResetSeconds: errorResetSeconds ?? snapshot.errorResetSeconds,
        requestRemain: requestRemain ?? snapshot.requestRemain,
        requestLimit: requestLimit ?? snapshot.requestLimit,
      };
    },

    check() {
      const { errorRemain, errorResetSeconds, requestRemain, requestLimit } =
        snapshot;

      if (errorRemain !== null && errorRemain <= minErrors) {
        const reset = errorResetSeconds;
        const suffix = reset === null ? "" : ` for about ${reset}s`;
        throw new EsiBudgetError(
          `ESI error budget is down to ${errorRemain}; pausing requests${suffix}.`,
          reset === null ? undefined : reset * 1000,
        );
      }

      if (requestRemain !== null && requestRemain <= minRequests) {
        const limit = requestLimit === null ? "" : ` of ${requestLimit}`;
        throw new EsiBudgetError(
          `ESI request budget is down to ${requestRemain}${limit}; try again later.`,
        );
      }
    },
  };
}

/** `Retry-After` is either delta-seconds or an HTTP date. */
export function parseRetryAfter(
  value: string | undefined,
  nowMs: number,
): number | undefined {
  if (value === undefined) return undefined;

  const seconds = Number(value.trim());
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const at = Date.parse(value);
  if (!Number.isFinite(at)) return undefined;
  return Math.max(0, at - nowMs);
}

export function withBudgetGuard(
  transport: Transport,
  budget: EsiBudget,
  now: () => number = () => Date.now(),
): Transport {
  return async (url, request) => {
    // Checked per request, not per appraisal: a queue can outlive a budget.
    budget.check();

    const response = await transport(url, request);
    budget.observe(response.headers);

    if (response.status === 429 || response.status === 420) {
      const retryAfterMs = parseRetryAfter(response.headers["retry-after"], now());
      const wait =
        retryAfterMs === undefined
          ? ""
          : ` retry in ${Math.max(1, Math.ceil(retryAfterMs / 1000))}s.`;
      throw new EsiBudgetError(
        `ESI rate limit hit (${response.status}).${wait}`,
        retryAfterMs,
      );
    }

    return response;
  };
}

/**
 * A process-wide semaphore over the transport. The slot is handed straight to
 * the next waiter, so `active` can never exceed the limit even when a new
 * caller arrives at the same moment as a release.
 */
export function withConcurrencyLimit(
  transport: Transport,
  maxConcurrent: number,
): Transport {
  const limit = Math.max(1, Math.floor(maxConcurrent));
  let active = 0;
  const waiting: (() => void)[] = [];

  function acquire(): Promise<void> {
    if (active < limit) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      waiting.push(resolve);
    });
  }

  function release(): void {
    const next = waiting.shift();
    if (next !== undefined) {
      // Transfer this slot instead of freeing and re-taking it.
      next();
      return;
    }
    active -= 1;
  }

  return async (url, request) => {
    await acquire();
    try {
      return await transport(url, request);
    } finally {
      release();
    }
  };
}
