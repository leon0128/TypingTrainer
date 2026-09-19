import { LanguagesResponseSchema, type Language } from '@typing-trainer/contracts';

import { request } from './client';

/** The languages the server has content for, in display order (§9.5). */
export async function listLanguages(signal?: AbortSignal): Promise<Language[]> {
  const { languages } = await request('/languages', {
    schema: LanguagesResponseSchema,
    ...(signal === undefined ? {} : { signal }),
  });
  return languages;
}
