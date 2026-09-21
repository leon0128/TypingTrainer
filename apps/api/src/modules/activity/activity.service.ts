import { Inject, Injectable } from '@nestjs/common';
import {
  ACTIVITY_DEFAULT_DAYS,
  type ActivityRequest,
  type ActivityResponse,
  type User,
} from '@typing-trainer/contracts';

import { addDays } from '../../common/local-date';
import { ActivityRepository } from './activity.repository';

export type ActivitySource = Pick<ActivityRepository, 'today' | 'days'>;

@Injectable()
export class ActivityService {
  constructor(@Inject(ActivityRepository) private readonly activity: ActivitySource) {}

  /**
   * The runs of the signed-in user by local date (§13.8). The range defaults to the last 365 days
   * up to today in the profile time zone; with one end given, the 365 days that end or start there.
   */
  async get(user: Pick<User, 'id'>, request: ActivityRequest): Promise<ActivityResponse> {
    const span = ACTIVITY_DEFAULT_DAYS - 1;
    const to =
      request.to ??
      (request.from === undefined
        ? await this.activity.today(user.id)
        : addDays(request.from, span));
    const from = request.from ?? addDays(to, -span);
    return { from, to, days: await this.activity.days(user.id, from, to) };
  }
}
