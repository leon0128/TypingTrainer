def bounding_box(points):
    points = list(points)
    if not points:
        raise ValueError("at least one point is required")
    xs = [x for x, _ in points]
    ys = [y for _, y in points]
    return (min(xs), min(ys)), (max(xs), max(ys))
