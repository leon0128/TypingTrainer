import type { ActivityResponse } from '@typing-trainer/contracts';
import { useEffect, useState } from 'react';

import { getActivity } from '../../lib/api/activity';
import { describeError } from '../../lib/api/describe-error';

/** The player's runs by day over the last year, or null until they arrive, with the reason if not. */
export function useActivity(): { activity: ActivityResponse | null; error: string | null } {
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    getActivity(controller.signal)
      .then(setActivity)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(describeError(cause));
      });
    return () => {
      controller.abort();
    };
  }, []);
  return { activity, error };
}
