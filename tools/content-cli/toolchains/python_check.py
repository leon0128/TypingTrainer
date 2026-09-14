"""Syntax check for Python content blocks with CPython 3.12, used by the content CLI.

`python3.12 python_check.py <file>...` compiles each file and prints one JSON object per error or
warning (warnings count as errors, e.g. "invalid decimal literal" for `1if`).
`python3.12 python_check.py --stdlib` prints `sys.stdlib_module_names` as a sorted JSON array.
"""

import json
import sys
import warnings

if sys.version_info[:2] != (3, 12):
    print(f"python_check.py needs Python 3.12, not {sys.version.split()[0]}", file=sys.stderr)
    sys.exit(2)


def emit(path, line, column, message):
    print(json.dumps({"path": path, "line": line or 1, "column": column or 1, "message": message}))


def main(args):
    if args == ["--stdlib"]:
        print(json.dumps(sorted(sys.stdlib_module_names)))
        return
    for path in args:
        with open(path, encoding="utf-8") as handle:
            source = handle.read()
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            try:
                compile(source, path, "exec")
            except SyntaxError as error:
                emit(path, error.lineno, error.offset, error.msg)
                continue
        for warning in caught:
            emit(path, warning.lineno, 1, f"{warning.category.__name__}: {warning.message}")


main(sys.argv[1:])
