def pick(names, banned):
    kept = [name for name in names if name not in banned and name is not None]
    key = lambda name: (len(name), name)
    if (count := len(kept)) > 0:
        return sorted(kept, key=key)[:count]
    return []
