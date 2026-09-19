/**
 * A response the API refused. `status` is the HTTP status and `message` the API's own message
 * (§9.5), which is written for the player; 5xx messages are generic by design.
 */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Seconds to wait, from `Retry-After` on a 429 (§7). */
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/** The request never produced a response: offline, DNS, a dropped connection, or an abort. */
export class NetworkError extends Error {
  constructor(override readonly cause: unknown) {
    super('the server could not be reached');
    this.name = 'NetworkError';
  }
}

/** A response that does not match the contract schema, which means client and API disagree. */
export class ContractError extends Error {
  constructor(
    readonly path: string,
    override readonly cause: unknown,
  ) {
    super(`the response from ${path} did not match the expected shape`);
    this.name = 'ContractError';
  }
}
