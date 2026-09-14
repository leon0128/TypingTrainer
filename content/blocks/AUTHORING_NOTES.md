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

- google-java-format also inserts blank lines between members of a nested class, enum, or
  record body (fields, constructors, methods). A Java block that declares a type can therefore
  hold only one member inside it, such as a record with a single compact constructor or method.
  Anonymous class bodies are affected too, so avoid anonymous classes with several members.

- google-java-format moves a block-bodied lambda passed as an argument onto its own lines with
  deep indentation. That is acceptable, but prefer a local variable or a loop when the lambda
  would otherwise dominate the block.

- black inserts a blank line after a nested `def` when more statements follow it, so Python
  blocks cannot define inner functions such as decorator wrappers or closures. Use a generator
  with `contextlib.contextmanager`, a lambda, or a top-level helper instead.
- A Python class block must hold exactly one method, and black separates class attributes from
  a following method with a blank line. Dataclasses, enums, and NamedTuples therefore cannot be
  blocks; write classes whose only member is a method such as `__init__`.

## Formatting

- TypeScript blocks are Prettier default output (double quotes, width 80), not the repository's
  own Prettier settings. Format with `prettier --no-config`.

## Line width

- Aim for at most 80 columns and never exceed 88 (tabs count as 4 columns). The play screen
  shows code in an 18px monospace font inside a 1040px column, which fits roughly 88 characters
  after padding. This is an authoring guideline, not a pipeline check.
- Formatter limits are wider for some languages (gofmt has none, google-java-format allows 100),
  so keep long lines short by rewriting them: extract a local variable or split the condition.
  google-java-format joins manual line breaks back up to 100 columns, so breaking a line by hand
  does not help in Java.
- Written before this guideline and wider than 88 columns, to be checked on the real play
  screen in U7: go/poll-until-canceled.go (94), go/grid-shortest-path.go (94),
  go/table-driven-test.go (90).

Add new findings of this kind here.
