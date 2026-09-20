import {
  PreferencesSchema,
  type Preferences,
  type UpdatePreferencesRequest,
} from '@typing-trainer/contracts';

import { request } from './client';

export function getPreferences(signal?: AbortSignal): Promise<Preferences> {
  return request('/preferences', {
    schema: PreferencesSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

/** Changes the settings sent and returns everything as it now is. */
export function updatePreferences(patch: UpdatePreferencesRequest): Promise<Preferences> {
  return request('/preferences', { method: 'PUT', body: patch, schema: PreferencesSchema });
}
