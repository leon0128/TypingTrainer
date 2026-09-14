def safe_int(text, default=0):
    try:
        return int(text.strip())
    except (AttributeError, ValueError):
        return default
    finally:
        logging.debug("parsed %r", text)
