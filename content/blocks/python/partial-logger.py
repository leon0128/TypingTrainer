def make_loggers(prefixes):
    loggers = {}
    for prefix in prefixes:
        loggers[prefix] = functools.partial(print, f"[{prefix}]", sep=" ")
    loggers["all"] = functools.partial(print, *(f"[{p}]" for p in prefixes))
    return loggers
