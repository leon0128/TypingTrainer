import { Inject, Injectable } from '@nestjs/common';
import {
  ContentLanguageSchema,
  type LanguageRating,
  type RatingsResponse,
  type User,
} from '@typing-trainer/contracts';

import { RatingsRepository } from './ratings.repository';

export type RatingSource = Pick<RatingsRepository, 'list'>;

@Injectable()
export class RatingsService {
  constructor(@Inject(RatingsRepository) private readonly ratings: RatingSource) {}

  /** The player's rating in every enabled language, unplayed ones included (§4.3.5). */
  async get(user: Pick<User, 'id'>): Promise<RatingsResponse> {
    const languages: LanguageRating[] = [];
    for (const row of await this.ratings.list(user.id)) {
      const slug = ContentLanguageSchema.safeParse(row.slug);
      if (!slug.success) continue;
      languages.push({
        language: slug.data,
        displayName: row.displayName,
        rating: row.rating,
        gamesPlayed: row.gamesPlayed,
      });
    }
    return { languages };
  }
}
