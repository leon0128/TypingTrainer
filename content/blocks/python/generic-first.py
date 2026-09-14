def first[T](
    items: collections.abc.Iterable[T], predicate=None, default: T | None = None
):
    for item in items:
        if predicate is None or predicate(item):
            return item
    return default
