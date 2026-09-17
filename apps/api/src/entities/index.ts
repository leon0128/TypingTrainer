import { AuthSession } from './auth-session.entity';
import { PlaySession } from './play-session.entity';
import { ProgrammingLanguage } from './programming-language.entity';
import { User } from './user.entity';

export { AuthSession, PlaySession, ProgrammingLanguage, User };

/**
 * Every entity, listed explicitly: the production bundle has no entity files for a glob to find.
 */
export const ENTITIES = [ProgrammingLanguage, User, AuthSession, PlaySession];
