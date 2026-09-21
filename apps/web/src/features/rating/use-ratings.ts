import type { RatingsResponse } from '@typing-trainer/contracts';
import { useEffect, useState } from 'react';

import { getRatings } from '../../lib/api/ratings';

/**
 * The player's ratings, or null until they arrive. A ratings request that fails leaves them null
 * and the screen simply shows no ratings: the rest of the screen works without them, and the
 * request that matters is the one the screen is for.
 */
export function useRatings(): RatingsResponse | null {
  const [ratings, setRatings] = useState<RatingsResponse | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    getRatings(controller.signal)
      .then(setRatings)
      .catch(() => {
        /* shown without ratings */
      });
    return () => {
      controller.abort();
    };
  }, []);
  return ratings;
}
