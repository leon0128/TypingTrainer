def run_length_encode(text):
    parts = []
    for char, group in itertools.groupby(text):
        count = sum(1 for _ in group)
        parts.append(f"{count}{char}" if count > 1 else char)
    return "".join(parts)
