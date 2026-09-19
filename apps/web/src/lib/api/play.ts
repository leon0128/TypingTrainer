import {
  StartSessionResponseSchema,
  SubmitResultResponseSchema,
  type ContentLanguage,
  type PlayRun,
  type SessionLog,
  type StartSessionResponse,
} from '@typing-trainer/contracts';

import { request, requestMaybe } from './client';

/** Asks for a run: 20 blocks, the seed that drew them, and the run length (§5.3, §9.5). */
export function startSession(language: ContentLanguage): Promise<StartSessionResponse> {
  return request('/play/sessions', {
    method: 'POST',
    body: { language, mode: 'single' },
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
