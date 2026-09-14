@contextlib.contextmanager
def timed(label):
    start = time.perf_counter()
    try:
        yield
    finally:
        elapsed = time.perf_counter() - start
        print(f"{label} took {elapsed:.3f}s")
