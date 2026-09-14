import type { INestApplicationContext } from '@nestjs/common';
import {
  CONTROLLER_WATERMARK,
  INJECTABLE_WATERMARK,
  SELF_DECLARED_DEPS_METADATA,
} from '@nestjs/common/constants.js';
import { ModulesContainer } from '@nestjs/core';

/**
 * Lists the application's controllers and providers whose constructor declares more parameters
 * than it names with @Inject.
 *
 * The API is built without decorator metadata, and Nest then injects `undefined` for a parameter
 * without @Inject instead of failing at startup. Comparing the constructor's declared parameter
 * count with the @Inject entries catches that for every class, including ones added later.
 *
 * Only classes marked with @Injectable() or @Controller() are inspected, which skips framework
 * providers such as ModuleRef; application providers must therefore always carry @Injectable().
 * `Function.length` does not count parameters with default values, so injected parameters must
 * not have defaults.
 */
export function missingInjections(context: INestApplicationContext): string[] {
  const offenders = new Set<string>();
  for (const module of context.get(ModulesContainer).values()) {
    for (const wrapper of [...module.controllers.values(), ...module.providers.values()]) {
      const { metatype } = wrapper;
      if (typeof metatype !== 'function' || wrapper.isFactory || wrapper.isNotMetatype) continue;
      const marked =
        Reflect.getMetadata(INJECTABLE_WATERMARK, metatype) === true ||
        Reflect.getMetadata(CONTROLLER_WATERMARK, metatype) === true;
      if (!marked) continue;
      const declared = (Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, metatype) ??
        []) as unknown[];
      if (metatype.length > declared.length) {
        offenders.add(`${module.metatype.name}/${metatype.name}`);
      }
    }
  }
  return [...offenders].sort();
}
