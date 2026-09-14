def read_chunks(path, size=64 * 1024):
    if size <= 0:
        raise ValueError("size must be positive")
    with open(path, "rb") as file:
        while chunk := file.read(size):
            yield chunk
