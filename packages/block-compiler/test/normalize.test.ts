import { describe, expect, it } from 'vitest';

import { normalizeIndentation } from '../src';

describe('normalizeIndentation', () => {
  it('converts leading tabs to spaces', () => {
    expect(
      normalizeIndentation('func f() {\n\tif x {\n\t\treturn\n\t}\n}\n', { tabWidth: 4 }),
    ).toBe('func f() {\n    if x {\n        return\n    }\n}\n');
  });

  it('keeps gofmt alignment spaces that follow the indentation', () => {
    expect(normalizeIndentation('\t"width":  80,\n\t"height": 24,', { tabWidth: 4 })).toBe(
      '    "width":  80,\n    "height": 24,',
    );
  });

  it('leaves tabs that are not leading indentation for the compiler to reject', () => {
    expect(normalizeIndentation('\ts := "a\\tb\tc"', { tabWidth: 4 })).toBe('    s := "a\\tb\tc"');
    expect(normalizeIndentation('  \tx', { tabWidth: 4 })).toBe('  \tx');
  });

  it('is idempotent', () => {
    const once = normalizeIndentation('\t\tx\n\ty', { tabWidth: 2 });
    expect(normalizeIndentation(once, { tabWidth: 2 })).toBe(once);
  });

  it('rejects a non-positive or fractional tab width', () => {
    expect(() => normalizeIndentation('\tx', { tabWidth: 0 })).toThrow(RangeError);
    expect(() => normalizeIndentation('\tx', { tabWidth: 1.5 })).toThrow(RangeError);
  });
});
