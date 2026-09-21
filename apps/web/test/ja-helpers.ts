import { expect } from 'vitest';

import en from '../src/i18n/locales/en.json';

/** Every English sentence the app has, so a screen in Japanese can be checked for leftovers. */
function englishTexts(): string[] {
  const found: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === 'string') found.push(value);
    else if (value !== null && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(en);
  return (
    found
      .filter((text) => !text.includes('{{') && text.length >= 4)
      // Names that are the same in both languages are not leftovers.
      .filter(
        (text) =>
          ![
            'TypingTrainer',
            'English',
            // Part of the names of fonts (Fira Code, Source Code Pro), which are not translated.
            'Code',
            'vs CPU',
            'KPM',
            'Okabe–Ito',
            'TIME',
            'PLAYER',
            'RIVAL',
            'NEXT',
            'SCORE',
          ].includes(text),
      )
  );
}

/** Fails if a screen showing Japanese still shows a sentence that is in the English resource. */
export function expectNoEnglish(container: HTMLElement): void {
  const shown = container.textContent;
  for (const text of englishTexts())
    expect(shown, `English left over: "${text}"`).not.toContain(text);
}
