import { ApiErrorSchema } from '@typing-trainer/contracts';

import { ApiRequestError, ContractError, NetworkError } from './errors';

/**
 * The part of a contract schema this client uses. Structural on purpose: naming zod's own
 * `ZodType<T>` here makes the checker compare its three type parameters under
 * `exactOptionalPropertyTypes`, which measured 5.4 GB and 112 s before running out of memory.
 */
export interface ResponseSchema<T> {
  safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: unknown };
}

/** Requests go to the same origin: in development Vite proxies `/api` to the API (§9.4). */
const BASE_PATH = '/api';

export interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Serialized as JSON; the API refuses any other content type (§7). */
  body?: unknown;
  /** The contract schema the response must match, or null for a 204 with no body. */
  schema: ResponseSchema<T> | null;
  signal?: AbortSignal;
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();

/**
 * Runs when any request is answered 401, so a session that ended on the server is dropped on the
 * client too. Returns a function that removes the listener.
 */
export function onUnauthorized(listener: Listener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

/**
 * One request to the API. The response is validated against the contract schema, so a client and
 * an API that disagree fail here rather than somewhere later with a confusing symptom.
 */
export async function request<T>(path: string, options: RequestOptions<T>): Promise<T> {
  const { url, response } = await send(path, options);
  return parse(url, response, options.schema);
}

/**
 * Like `request`, but an answer with no content is a result of its own rather than a missing
 * body: submitting a run with no keystroke is answered 204, and nothing is stored (§9.8).
 */
export async function requestMaybe<T>(path: string, options: RequestOptions<T>): Promise<T | null> {
  const { url, response } = await send(path, options);
  if (response.status === 204) return null;
  return parse(url, response, options.schema);
}

async function send<T>(
  path: string,
  { method = 'GET', body, signal }: RequestOptions<T>,
): Promise<{ url: string; response: Response }> {
  const url = `${BASE_PATH}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      // The session cookie is httpOnly and same-origin; nothing is read from JavaScript (§7).
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (cause) {
    throw new NetworkError(cause);
  }

  if (!response.ok) throw await toRequestError(response);
  return { url, response };
}

async function parse<T>(
  url: string,
  response: Response,
  schema: ResponseSchema<T> | null,
): Promise<T> {
  if (schema === null) return undefined as T;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new ContractError(url, cause);
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new ContractError(url, parsed.error);
  return parsed.data;
}

async function toRequestError(response: Response): Promise<ApiRequestError> {
  if (response.status === 401) {
    for (const listener of unauthorizedListeners) listener();
  }
  const retryAfter = retryAfterSeconds(response.headers.get('retry-after'));
  return new ApiRequestError(response.status, await errorMessage(response), retryAfter);
}

/** The API's own message, or the status text when the body is not the documented error shape. */
async function errorMessage(response: Response): Promise<string> {
  try {
    const parsed = ApiErrorSchema.safeParse(await response.json());
    if (parsed.success) return parsed.data.message;
  } catch {
    // Fall through to the status text below.
  }
  return response.statusText === ''
    ? `request failed with ${String(response.status)}`
    : response.statusText;
}

function retryAfterSeconds(header: string | null): number | undefined {
  if (header === null) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : undefined;
}
