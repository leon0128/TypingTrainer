def edit_distance(source, target):
    previous = list(range(len(target) + 1))
    for i, s in enumerate(source, 1):
        current = [i]
        for j, t in enumerate(target, 1):
            substitution = previous[j - 1] + (s != t)
            current.append(min(previous[j] + 1, current[j - 1] + 1, substitution))
        previous = current
    return previous[-1]
