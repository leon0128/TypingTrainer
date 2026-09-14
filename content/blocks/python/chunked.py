def chunked(iterable, size):
    if size < 1:
        raise ValueError("size must be at least 1")
    iterator = iter(iterable)
    while batch := tuple(itertools.islice(iterator, size)):
        yield batch
