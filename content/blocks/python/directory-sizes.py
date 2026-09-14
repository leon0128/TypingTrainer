def largest_files(root, count=5):
    sizes = []
    for path in pathlib.Path(root).rglob("*"):
        if path.is_file() and not path.is_symlink():
            sizes.append((path.stat().st_size, path))
    sizes.sort(reverse=True)
    return [(str(path.relative_to(root)), size) for size, path in sizes[:count]]
