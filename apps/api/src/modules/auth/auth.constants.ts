/** Session policy (§7). Intervals are PostgreSQL interval literals, evaluated on the database clock. */
export const SESSION_ABSOLUTE_LIFETIME = '30 days';
export const SESSION_IDLE_LIFETIME = '7 days';
/** last_seen_at is refreshed at most this often, so a session can end up to this much early. */
export const SESSION_TOUCH_INTERVAL = '1 hour';
/** Cookie Max-Age, matching the absolute lifetime. */
export const SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
/** Older sessions beyond this count are deleted when a user signs in. */
export const MAX_SESSIONS_PER_USER = 10;
/** Random bytes in a session token; the cookie carries them base64url-encoded (43 characters). */
export const SESSION_TOKEN_BYTES = 32;
/** How often expired and idle sessions are deleted in bulk. */
export const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
/** Request bodies of /api/auth/* routes are small; larger ones are refused before parsing. */
export const AUTH_BODY_LIMIT_BYTES = 16 * 1024;
