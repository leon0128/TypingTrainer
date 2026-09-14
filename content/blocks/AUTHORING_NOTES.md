# Block authoring notes

Practical tips for writing blocks that pass `pnpm content:build`. The contract itself lives in
docs/requirements.md §5.2; this file only collects lessons learned while writing content.

## Blank lines

- Blocks must not contain blank lines; the compiler rejects them (`compile/blank-line`).
- When a type and a function form one block, write them without a blank line in between.
  Prettier keeps the absence of a blank line, so the formatter check still passes.
- Do not put several elements into one block when the language's formatter inserts blank lines
  between them (methods, top-level definitions). This is the same reason blocks are limited to
  one Go declaration, one Java member, and one Python top-level definition.

## Formatting

- TypeScript blocks are Prettier default output (double quotes, width 80), not the repository's
  own Prettier settings. Format with `prettier --no-config`.

Add new findings of this kind here.
