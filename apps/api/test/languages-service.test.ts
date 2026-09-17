import { describe, expect, it } from 'vitest';

import type { ProgrammingLanguage } from '../src/entities';
import { LanguagesService } from '../src/modules/languages/languages.service';

const row = (slug: string, displayName: string): ProgrammingLanguage =>
  Object.assign(Object.create(null) as ProgrammingLanguage, { slug, displayName });

describe('LanguagesService.list', () => {
  it('maps enabled rows to contract languages in the order the repository returns', async () => {
    const service = new LanguagesService({
      findEnabled: () => Promise.resolve([row('go', 'Go'), row('python', 'Python')]),
    });
    expect(await service.list()).toEqual({
      languages: [
        { slug: 'go', displayName: 'Go' },
        { slug: 'python', displayName: 'Python' },
      ],
    });
  });

  it('omits a row whose slug is not a content language instead of failing the list', async () => {
    const service = new LanguagesService({
      findEnabled: () => Promise.resolve([row('rust', 'Rust'), row('java', 'Java')]),
    });
    expect(await service.list()).toEqual({ languages: [{ slug: 'java', displayName: 'Java' }] });
  });
});
