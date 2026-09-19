import {
  StartSessionResponseSchema,
  type ContentLanguage,
  type StartSessionResponse,
} from '@typing-trainer/contracts';

import { request } from './client';

/** Asks for a run: 20 blocks, the seed that drew them, and the run length (§5.3, §9.5). */
export function startSession(language: ContentLanguage): Promise<StartSessionResponse> {
  return request('/play/sessions', {
    method: 'POST',
    body: { language, mode: 'single' },
    schema: StartSessionResponseSchema,
  });
}
