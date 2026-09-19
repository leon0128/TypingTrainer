/**
 * Issuing runs (§9.5). A run lasts two minutes, so 120 issues an hour is far above real play and
 * only bounds how fast issued_runs can grow.
 */
export const ISSUE_LIMIT_PER_USER = 120;
export const ISSUE_WINDOW_MS = 60 * 60 * 1000;

/** Issued runs are deleted a day later; a result is only accepted for 17.5 minutes (§9.8). */
export const ISSUED_RUN_RETENTION = '1 day';
export const ISSUED_RUN_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * A submitted log holds at most 12,000 keys and their millisecond gaps (MAX_SESSION_KEYS), which
 * is roughly 100 KB of JSON; anything larger is refused before it is parsed.
 */
export const RESULT_BODY_LIMIT_BYTES = 256 * 1024;
