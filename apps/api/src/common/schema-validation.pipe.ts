import {
  BadRequestException,
  StandardSchemaValidationPipe,
  type StandardSchemaValidationPipeOptions,
} from '@nestjs/common';

type Issues = Parameters<NonNullable<StandardSchemaValidationPipeOptions['exceptionFactory']>>[0];

/** Formats schema issues as `path: message`, without ever including the submitted values. */
export function formatIssues(issues: Issues): string {
  return issues
    .map((issue) => {
      const path = (issue.path ?? [])
        .map((segment) => String(typeof segment === 'object' ? segment.key : segment))
        .join('.');
      return path === '' ? issue.message : `${path}: ${issue.message}`;
    })
    .join('; ');
}

/**
 * Validates every parameter declared with a schema, such as `@Body({ schema: LoginRequestSchema })`,
 * and hands the handler the parsed value (defaults and transforms applied). Parameters without a
 * schema pass through untouched.
 */
export function createSchemaValidationPipe(): StandardSchemaValidationPipe {
  return new StandardSchemaValidationPipe({
    exceptionFactory: (issues) => new BadRequestException(formatIssues(issues)),
  });
}
