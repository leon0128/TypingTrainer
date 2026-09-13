def describe(name, score, width):
    label = f"{name!r:>{width}}"
    return rf"\d+ {label}: {score:.2f} ({f'{score * 100:.0f}'}%)"
