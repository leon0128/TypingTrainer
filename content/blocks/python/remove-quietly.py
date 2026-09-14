def clean_build_outputs(root):
    removed = 0
    for pattern in ("*.pyc", "*.log", "*.tmp"):
        for path in pathlib.Path(root).rglob(pattern):
            with contextlib.suppress(FileNotFoundError, PermissionError):
                path.unlink()
                removed += 1
    return removed
