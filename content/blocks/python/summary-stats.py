def summarize(samples):
    if len(samples) < 2:
        raise ValueError("need at least two samples")
    return {
        "mean": statistics.fmean(samples),
        "median": statistics.median(samples),
        "stdev": statistics.stdev(samples),
        "quartiles": statistics.quantiles(samples, n=4),
    }
