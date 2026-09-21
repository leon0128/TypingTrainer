import { InitialSchema1789646863673 } from './1789646863673-InitialSchema';
import { AddUsernameCheck1789648873477 } from './1789648873477-AddUsernameCheck';
import { AddIssuedRuns1789823131650 } from './1789823131650-AddIssuedRuns';
import { AddCpuLevelToIssuedRuns1789900748145 } from './1789900748145-AddCpuLevelToIssuedRuns';
import { AddLocaleCheck1789902462677 } from './1789902462677-AddLocaleCheck';
import { AddUserPreferences1789903169290 } from './1789903169290-AddUserPreferences';
import { AddGhostToIssuedRuns1789905002284 } from './1789905002284-AddGhostToIssuedRuns';
import { AddSoundPreferences1789905782719 } from './1789905782719-AddSoundPreferences';
import { AddSkinPreference1789906000000 } from './1789906000000-AddSkinPreference';
import { AddDisplayName1789907000000 } from './1789907000000-AddDisplayName';
import { AddLanguageRatings1789968962575 } from './1789968962575-AddLanguageRatings';
import { RenameLanguagesAddTracks1790000000000 } from './1790000000000-RenameLanguagesAddTracks';
import { RelaxIssuedRunBlockCount1790100000000 } from './1790100000000-RelaxIssuedRunBlockCount';
import { AddUserPlayAppearance1790200000000 } from './1790200000000-AddUserPlayAppearance';

/**
 * Every migration in order, listed explicitly: the production bundle has no migration files for a
 * glob to find. A migration missing from this list is never run, and `migration:check` then
 * reports the schema difference.
 */
export const MIGRATIONS = [
  InitialSchema1789646863673,
  AddUsernameCheck1789648873477,
  AddIssuedRuns1789823131650,
  AddCpuLevelToIssuedRuns1789900748145,
  AddLocaleCheck1789902462677,
  AddUserPreferences1789903169290,
  AddGhostToIssuedRuns1789905002284,
  AddSoundPreferences1789905782719,
  AddSkinPreference1789906000000,
  AddDisplayName1789907000000,
  AddLanguageRatings1789968962575,
  RenameLanguagesAddTracks1790000000000,
  RelaxIssuedRunBlockCount1790100000000,
  AddUserPlayAppearance1790200000000,
];
