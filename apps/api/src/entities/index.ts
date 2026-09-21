import { AuthSession } from './auth-session.entity';
import { IssuedRun } from './issued-run.entity';
import { LanguageRating } from './language-rating.entity';
import { PlaySession } from './play-session.entity';
import { Language } from './language.entity';
import { UserPlayAppearance } from './user-play-appearance.entity';
import { UserPreferences } from './user-preferences.entity';
import { User } from './user.entity';

export {
  AuthSession,
  IssuedRun,
  LanguageRating,
  PlaySession,
  Language,
  User,
  UserPlayAppearance,
  UserPreferences,
};

/**
 * Every entity, listed explicitly: the production bundle has no entity files for a glob to find.
 */
export const ENTITIES = [
  Language,
  User,
  AuthSession,
  PlaySession,
  IssuedRun,
  UserPreferences,
  UserPlayAppearance,
  LanguageRating,
];
