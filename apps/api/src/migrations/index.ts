import { InitialSchema1789646863673 } from './1789646863673-InitialSchema';
import { AddUsernameCheck1789648873477 } from './1789648873477-AddUsernameCheck';
import { AddIssuedRuns1789823131650 } from './1789823131650-AddIssuedRuns';
import { AddCpuLevelToIssuedRuns1789900748145 } from './1789900748145-AddCpuLevelToIssuedRuns';
import { AddLocaleCheck1789902462677 } from './1789902462677-AddLocaleCheck';
import { AddUserPreferences1789903169290 } from './1789903169290-AddUserPreferences';

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
];
