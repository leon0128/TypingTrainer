export {
  ENTER_KEY,
  SPACE_KEY,
  TAB_KEY,
  createEngineState,
  handleKey,
  isComplete,
  isUntypedAtom,
} from './engine';
export type { EngineState, KeyResult, KeystrokeCounters, Verdict } from './engine';
export { classifyKey } from './key-classification';
export type { KeyDisposition, KeyInput } from './key-classification';
export { PLAY_DURATION_MS, computeAccuracy, computeMetrics } from './metrics';
export type { OfficialMetrics } from './metrics';
export {
  IDLE_LIMIT_MS,
  buildSessionLog,
  canonicalReached,
  createSession,
  endSessionByTime,
  isSessionIdleExpired,
  replaySession,
  sessionCounters,
  sessionIdleMs,
  sessionKey,
} from './session';
export type {
  IntervalStats,
  LoggedKey,
  SessionEnd,
  SessionKeyResult,
  SessionReplay,
  SessionState,
  SessionVerdict,
} from './session';
