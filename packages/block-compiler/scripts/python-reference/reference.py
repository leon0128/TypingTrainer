"""Regenerate the golden data that pins block-compiler's Python scanner to CPython 3.12.

Run with `pnpm --filter @typing-trainer/block-compiler python:golden`.

For every fixture it checks that the block is black output (`--target-version py312`), that
formatting it again changes nothing, that it has no blank lines, and that CPython compiles it
without errors or warnings. It then records CPython's tokens for each fixture and, for every token
pair, both the raw re-lex of the joined text and the corrected result described in
src/adapters/python.ts, plus raw re-lexes of a few fragments that combine a bracket error with a
lexical one. CI does not need Python: it only reads the committed golden file.
"""

import hashlib
import io
import json
import platform
import re
import subprocess
import sys
import token as T
import tokenize
import warnings
from pathlib import Path

SKIP = {T.NEWLINE, T.NL, T.INDENT, T.DEDENT, T.ENDMARKER, T.COMMENT}
BRACKET_TOKEN_ERRORS = {"unexpected EOF in multi-line statement"}
BRACKET_COMPILE_ERRORS = re.compile(
    r"^(unmatched '.'|closing parenthesis '.' does not match|'.' was never closed)"
)
FSTRING_START = re.compile(r"^(?:[rR]?[fF]|[fF][rR])(\"\"\"|'''|\"|')$")

# Token pairs checked in addition to every in-line separator found in the fixtures.
EXTRA_PAIRS = [
    ("1", "if"),
    ("1", "or"),
    ("0x1", "for"),
    ("1j", "if"),
    ("1", "."),
    ("0", "1"),
    ("1", "j"),
    ("r", '"x"'),
    ("f", '"x"'),
    ("*", "*"),
    ("/", "/"),
    ("-", ">"),
    (":", "="),
    ("not", "in"),
    ("is", "not"),
    ("@", "deco"),
    ("=", "["),
    ('"a"', '"b"'),
    ("x", "!"),
    ("1", ":"),
    ("{", "x"),
    ("x", "}"),
    ("return", 'rf"'),
    ("=", 'f"""'),
    ("return", 'f"""'),
    ("(", "f'''"),
]

# Fragments that are not token pairs: each combines a bracket error with a lexical one, which no
# pair of two valid tokens can do. They check that ignoring bracket errors keeps the lexical one.
FRAGMENTS = ["1or)", "1if(", "0x1for["]


def fail(message):
    sys.exit(f"python-reference: {message}")


def black(source):
    result = subprocess.run(
        ["black", "--target-version", "py312", "-q", "-"],
        input=source,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        fail(f"black failed: {result.stderr}")
    return result.stdout


def relex(text):
    tokens, lexical, bracket = [], [], []
    tokenize_error = None
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        try:
            for tok in tokenize.generate_tokens(io.StringIO(text + "\n").readline):
                if tok.type in SKIP or (tok.type == T.FSTRING_MIDDLE and tok.string == ""):
                    continue
                tokens.append(tok.string)
        except tokenize.TokenError as error:
            tokenize_error = error.args[0]
            (bracket if tokenize_error in BRACKET_TOKEN_ERRORS else lexical).append(tokenize_error)
        try:
            compile(text, "<pair>", "eval")
        except SyntaxError as error:
            # Parse errors are expected for fragments; only bracket balance is recorded.
            if BRACKET_COMPILE_ERRORS.match(error.msg or ""):
                bracket.append(error.msg)
    lexical += [str(w.message) for w in caught if issubclass(w.category, SyntaxWarning)]
    return {
        "text": text,
        "tokens": tokens,
        "tokenizeError": tokenize_error,
        "lexical": lexical,
        "bracket": bracket,
    }


def analyze(prev, nxt):
    raw = relex(prev + nxt)
    corrections = []
    closing = None
    completed = raw
    match = FSTRING_START.match(nxt)
    if match:
        closing = match.group(1)
        completed = relex(prev + nxt + closing)
        corrections.append("complete-fstring-start")
    if completed["bracket"]:
        corrections.append("ignore-bracket-balance")
    compared = completed["tokens"]
    if closing is not None and len(compared) == 3 and compared[2] == closing:
        compared = compared[:2]
    if compared != [prev, nxt]:
        reason = "token-mismatch"
    elif completed["lexical"]:
        reason = "scanner-error"
    else:
        reason = "separable"
    return {
        "prev": prev,
        "next": nxt,
        "raw": raw,
        "corrected": {
            "text": completed["text"],
            "tokens": completed["tokens"],
            "lexical": completed["lexical"],
        },
        "corrections": corrections,
        "reason": reason,
    }


def fixture_tokens(source, name):
    offsets = [0]
    for line in source.splitlines(keepends=True):
        offsets.append(offsets[-1] + len(line))
    tokens = []
    for tok in tokenize.generate_tokens(io.StringIO(source).readline):
        if tok.type in SKIP or (tok.type == T.FSTRING_MIDDLE and tok.string == ""):
            continue
        start = offsets[tok.start[0] - 1] + tok.start[1]
        end = offsets[tok.end[0] - 1] + tok.end[1]
        text = source[start:end]
        if tok.type == T.FSTRING_MIDDLE and text != tok.string:
            fail(f"{name}: FSTRING_MIDDLE {tok.string!r} does not match its source {text!r}")
        tokens.append({"text": text, "start": start, "end": end})
    return tokens


def main():
    if sys.version_info[:2] != (3, 12):
        fail(f"run with Python 3.12, not {platform.python_version()}")
    if len(sys.argv) != 3:
        fail("usage: reference.py <fixtures-dir> <golden-json>")
    fixtures_dir, out = Path(sys.argv[1]), Path(sys.argv[2])
    paths = sorted(fixtures_dir.glob("*.py"))
    if not paths:
        fail(f"no Python fixtures in {fixtures_dir}")

    black_version = subprocess.run(
        ["black", "--version"], capture_output=True, text=True, check=True
    ).stdout.splitlines()[0]

    fixtures, pair_keys = [], []
    for path in paths:
        name = path.name
        source = path.read_text()
        formatted = black(source)
        if formatted != source:
            fail(f"{name} is not black output")
        if black(formatted) != formatted:
            fail(f"{name}: black formatting is not idempotent")
        if "\n\n" in source:
            fail(f"{name} contains a blank line")
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            try:
                compile(source, name, "exec")
            except SyntaxError as error:
                fail(f"{name}: {error.msg}")
        if caught:
            fail(f"{name}: {[str(w.message) for w in caught]}")

        tokens = fixture_tokens(source, name)
        for prev, nxt in zip(tokens, tokens[1:]):
            gap = source[prev["end"] : nxt["start"]]
            key = (prev["text"], nxt["text"])
            if gap and set(gap) == {" "} and key not in pair_keys:
                pair_keys.append(key)
        fixtures.append(
            {
                "name": name,
                "sha256": hashlib.sha256(source.encode()).hexdigest(),
                "tokens": tokens,
            }
        )

    for key in EXTRA_PAIRS:
        if key not in pair_keys:
            pair_keys.append(key)

    golden = {
        "generatedBy": f"CPython {platform.python_version()}",
        "black": black_version,
        "fixtures": fixtures,
        "pairs": [analyze(prev, nxt) for prev, nxt in pair_keys],
        "fragments": [relex(text) for text in FRAGMENTS],
    }
    out.write_text(json.dumps(golden, indent=2) + "\n")
    print(f"wrote {out}: {len(fixtures)} fixtures, {len(pair_keys)} pairs, {len(FRAGMENTS)} fragments")


if __name__ == "__main__":
    main()
