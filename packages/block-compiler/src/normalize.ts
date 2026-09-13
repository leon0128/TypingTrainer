export interface NormalizeIndentationOptions {
  /** Spaces per leading tab. */
  readonly tabWidth: number;
}

/**
 * Converts the leading tabs of every line to spaces (§5.2 step 1, §5.4.1).
 *
 * Only indentation is touched. gofmt indents with tabs and aligns with spaces after them, so
 * alignment survives the conversion. Tabs anywhere else, including after leading spaces or inside
 * string literals, are left in place for `compileBlock` to reject.
 */
export function normalizeIndentation(
  source: string,
  { tabWidth }: NormalizeIndentationOptions,
): string {
  if (!Number.isInteger(tabWidth) || tabWidth < 1) {
    throw new RangeError(`tabWidth must be a positive integer, got ${String(tabWidth)}`);
  }
  return source
    .split('\n')
    .map((line) => {
      const tabs = /^\t+/.exec(line)?.[0].length ?? 0;
      return ' '.repeat(tabs * tabWidth) + line.slice(tabs);
    })
    .join('\n');
}
