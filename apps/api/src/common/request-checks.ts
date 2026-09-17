import type { IncomingHttpHeaders } from 'node:http';

import type { ApiError } from '@typing-trainer/contracts';
import type { FastifyInstance } from 'fastify';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function originOf(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    const { origin } = new URL(value);
    // Opaque origins (sandboxed frames, file: pages) serialize as "null".
    return origin === 'null' ? undefined : origin;
  } catch {
    return undefined;
  }
}

function hasBody(headers: IncomingHttpHeaders): boolean {
  const length = headers['content-length'];
  return (length !== undefined && length !== '0') || headers['transfer-encoding'] !== undefined;
}

function isJson(headers: IncomingHttpHeaders): boolean {
  const mediaType = (headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase();
  return mediaType === 'application/json';
}

/**
 * CSRF defenses for state-changing requests (§7), alongside the SameSite=Lax session cookie:
 *
 * 1. The request must come from `appOrigin`: the Origin header must match it exactly, or, when a
 *    browser omits Origin, the origin of the Referer. With neither, the request is refused, which
 *    also refuses non-browser clients that do not send one.
 * 2. A body must be `application/json`. HTML forms can only send form encodings or text/plain,
 *    and Nest's Fastify adapter otherwise parses form bodies too.
 *
 * Returns the error to answer with, or undefined when the request may proceed.
 */
export function checkRequest(
  method: string,
  headers: IncomingHttpHeaders,
  appOrigin: string,
): ApiError | undefined {
  if (!STATE_CHANGING_METHODS.has(method.toUpperCase())) return undefined;

  const origin =
    headers.origin === undefined ? originOf(headers.referer) : originOf(headers.origin);
  if (origin !== appOrigin) {
    return { statusCode: 403, error: 'Forbidden', message: 'cross-origin request refused' };
  }
  if (hasBody(headers) && !isJson(headers)) {
    return {
      statusCode: 415,
      error: 'Unsupported Media Type',
      message: 'request bodies must be application/json',
    };
  }
  return undefined;
}

/**
 * Runs checkRequest before any body is parsed. The hook answers directly, outside Nest's exception
 * filter, so it sends the ApiError body itself.
 */
export function registerRequestChecks(instance: FastifyInstance, appOrigin: string): void {
  instance.addHook('onRequest', async (request, reply) => {
    const error = checkRequest(request.method, request.headers, appOrigin);
    if (error !== undefined) {
      return reply.code(error.statusCode).send(error);
    }
    return undefined;
  });
}
