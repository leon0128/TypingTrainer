def largest_jump(readings):
    jumps = [
        (later - earlier, index)
        for index, (earlier, later) in enumerate(itertools.pairwise(readings), 1)
    ]
    if not jumps:
        return None
    size, index = max(jumps, key=lambda jump: abs(jump[0]))
    return index, size
