import { ApiRequestError, ContractError, NetworkError } from './errors';

/**
 * A sentence to show the player. The API writes its own messages for the cases it knows (§9.5),
 * so they are shown as they are; anything else gets a plain description instead of a stack trace.
 */
export function describeError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.retryAfterSec !== undefined) {
      return `${error.message} — try again in ${String(error.retryAfterSec)} seconds.`;
    }
    return error.message;
  }
  if (error instanceof NetworkError)
    return 'The server could not be reached. Check your connection.';
  if (error instanceof ContractError) return 'The server sent an unexpected response.';
  return 'Something went wrong.';
}
