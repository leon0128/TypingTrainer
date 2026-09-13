def read_first(path):
    try:
        with open(path, encoding="utf-8") as handle:
            return handle.readline()
    except (OSError, ValueError) as error:
        raise RuntimeError(f"cannot read {path}") from error
    finally:
        print("done")
