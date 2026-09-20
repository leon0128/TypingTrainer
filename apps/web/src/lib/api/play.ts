import {
  StartSessionResponseSchema,
  SubmitResultResponseSchema,
  type ContentLanguage,
  type GhostPeriod,
  type PlayRun,
  type SessionLog,
  type StartSessionResponse,
} from '@typing-trainer/contracts';

import { request, requestMaybe } from './client';

/** What to race in a run: nobody, the CPU at a level (§4.3), or a record of one's own (§4.4). */
export type Opponent =
  | { readonly mode: 'single' }
  | { readonly mode: 'cpu'; readonly cpuLevel: number }
  | { readonly mode: 'ghost'; readonly ghostPeriod: GhostPeriod };

/** Asks for a run: 20 blocks, the seed that drew them, and the run length (§5.3, §9.5). */
export function startSession(
  language: ContentLanguage,
  opponent: Opponent = { mode: 'single' },
): Promise<StartSessionResponse> {
  return request('/play/sessions', {
    method: 'POST',
    body: { language, ...opponent },
    schema: StartSessionResponseSchema,
  });
}

/**
 * Submits the keystroke log of a finished run (§9.8). The server replays it against the blocks it
 * issued and answers with what it stored, or with nothing at all when the run had no keystroke to
 * score. The run is used up either way, so this is never sent twice for the same run.
 */
export async function submitResult(sessionId: string, log: SessionLog): Promise<PlayRun | null> {
  const body = await requestMaybe(`/play/sessions/${sessionId}/result`, {
    method: 'POST',
    body: { log },
    schema: SubmitResultResponseSchema,
  });
  return body === null ? null : body.run;
}
