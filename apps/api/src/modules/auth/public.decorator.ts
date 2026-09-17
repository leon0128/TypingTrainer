import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'typing-trainer:is-public';

/**
 * Marks a controller or handler as reachable without a session. Every other route requires one,
 * so a new route is private unless it opts out here.
 */
export const Public = (): ClassDecorator & MethodDecorator => SetMetadata(IS_PUBLIC, true);
