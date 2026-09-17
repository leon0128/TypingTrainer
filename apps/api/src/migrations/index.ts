import { InitialSchema1789646863673 } from './1789646863673-InitialSchema';

/**
 * Every migration in order, listed explicitly: the production bundle has no migration files for a
 * glob to find. A migration missing from this list is never run, and `migration:check` then
 * reports the schema difference.
 */
export const MIGRATIONS = [InitialSchema1789646863673];
